// Sends the phone notifications for Krarim, Kririm and The Rimmens, which share this Supabase project.
// Each person chooses what they get (columns notify_* and remind_before on profiles):
// - an answer (Kommer, Bliver forsinket, Kommer ikke) on an event they made (sent at once)
// - a new event made by the partner (sent at once, the database calls on each new event)
// - a reminder 1 hour or 1 day before an event, or none
// - deadlines: at 8:00 on the day a task is due
// - new shared tasks, shopping items and films the partner added (gathered, a few minutes late)
// Nothing ever crosses from one space to the other.
//
// Deployed as the Supabase Edge Function "notify" with JWT verification on. It takes no
// input: it works out from the tables what is due and records every notification in
// notices_sent before sending, so extra calls never send anything twice.
// Secrets (Edge Functions, Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const TZ = 'Europe/Copenhagen';
const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'];
const LEAD: Record<string, number> = { '1h': HOUR, '1d': DAY };
// Which choice covers new items on each kind of list, and how the notification reads.
const KINDS: Record<string, { pref: string; label: string }> = {
  todo: { pref: 'notify_todo', label: 'to-do' },
  shopping: { pref: 'notify_shopping', label: 'indkøbslisten' },
  watch: { pref: 'notify_films', label: 'film-listen' },
};

type Profile = {
  id: string; name: string; space: string;
  notify_events: boolean; remind_before: string; notify_deadlines: boolean;
  notify_todo: boolean; notify_shopping: boolean; notify_films: boolean; notify_responses: boolean;
};
const VERB: Record<string, string> = { joining: 'kommer', late: 'bliver forsinket', not_joining: 'kommer ikke' };
type Payload = { title: string; body: string; tag: string };

const when = (iso: string, allDay: boolean) =>
  new Intl.DateTimeFormat('da-DK', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ,
    ...(allDay ? {} : { hour: '2-digit', minute: '2-digit' }),
  }).format(new Date(iso));

// Today's date and hour in Denmark.
function localNow(now: number) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const short = (texts: string[]) => texts.length <= 3 ? texts.join(', ') : `${texts.slice(0, 3).join(', ')} og ${texts.length - 3} mere`;

Deno.serve(async () => {
  const missing = REQUIRED.filter((name) => !Deno.env.get(name));
  if (missing.length) return json({ error: 'missing settings', missing }, 500);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

  const now = Date.now();
  const iso = (t: number) => new Date(t).toISOString();
  const result = { events: 0, reminders: 0, deadlines: 0, items: 0, answers: 0, sent: 0, removed: 0, failed: 0 };

  try {
    const subs = await db.from('push_subscriptions').select('endpoint, user_id, p256dh, auth');
    if (subs.error) throw subs.error;
    // Nobody to tell: skip the rest (and do not mark anything as sent).
    if (!subs.data.length) return json(result);

    const profiles = await db.from('profiles')
      .select('id, name, space, notify_events, remind_before, notify_deadlines, notify_todo, notify_shopping, notify_films, notify_responses');
    if (profiles.error) throw profiles.error;
    const people = profiles.data as Profile[];
    const byId = new Map(people.map((p) => [p.id, p]));
    const withDevice = new Set(subs.data.map((s) => s.user_id));
    const listeners = people.filter((p) => withDevice.has(p.id));

    // Everything worth sending, keyed so it can be claimed exactly once.
    const outbox: { key: string; user: string; payload: Payload }[] = [];

    // New events and reminders.
    const evs = await db.from('events')
      .select('id, title, location, starts_at, all_day, created_by, created_at, space')
      .or(`created_at.gt.${iso(now - HOUR)},and(starts_at.gt.${iso(now)},starts_at.lte.${iso(now + DAY)})`);
    if (evs.error) throw evs.error;
    for (const ev of evs.data) {
      const start = new Date(ev.starts_at).getTime();
      const by = byId.get(ev.created_by)?.name;
      for (const p of listeners) {
        if (p.space !== ev.space) continue;
        const isNew = new Date(ev.created_at).getTime() > now - HOUR && p.id !== ev.created_by;
        if (isNew && p.notify_events) {
          outbox.push({ key: `event:${ev.id}:${p.id}`, user: p.id, payload: {
            title: `Ny aftale: ${ev.title}`,
            body: `${when(ev.starts_at, ev.all_day)}${by ? `. Lavet af ${by}.` : ''}`,
            tag: `event:${ev.id}`,
          } });
        }
        const lead = LEAD[p.remind_before];
        // A reminder is due once the event is within the chosen time. An event the partner
        // made inside that window was just announced, which serves as its reminder.
        if (!lead || start <= now || start - lead > now) continue;
        if (isNew && p.notify_events && new Date(ev.created_at).getTime() > start - lead) continue;
        outbox.push({ key: `remind:${ev.id}:${ev.starts_at}:${p.id}`, user: p.id, payload: {
          title: `Påmindelse: ${ev.title}`,
          body: `${when(ev.starts_at, ev.all_day)}${ev.location ? `, ${ev.location}` : ''}`,
          tag: `event:${ev.id}`,
        } });
      }
    }

    // Deadlines, from 8:00 on the day. One notification per person listing what is due.
    const today = localNow(now);
    if (today.hour >= 8) {
      const due = await db.from('items').select('id, text, owner, space, due').eq('due', today.date).eq('done', false);
      if (due.error) throw due.error;
      for (const p of listeners) {
        if (!p.notify_deadlines) continue;
        const mine = due.data.filter((i) => i.space === p.space && (!i.owner || i.owner === p.id));
        if (!mine.length) continue;
        outbox.push({ key: `due:${today.date}:${mine.map((i) => i.id).sort().join(',')}:${p.id}`, user: p.id, payload: {
          title: mine.length === 1 ? 'Deadline i dag' : `${mine.length} deadlines i dag`,
          body: short(mine.map((i) => i.text)),
          tag: `due:${today.date}`,
        } });
      }
    }

    // New items from the partner on the to-do (shared), the shopping list and the watchlist.
    // Gathered: only items at least two minutes old, so a quick run of additions is one notification.
    const added = await db.from('items')
      .select('id, text, owner, space, list_id, created_by, created_at, lists!inner(kind)')
      .is('owner', null)
      .in('lists.kind', Object.keys(KINDS))
      .gt('created_at', iso(now - HOUR))
      .lte('created_at', iso(now - 2 * MIN));
    if (added.error) throw added.error;
    for (const p of listeners) {
      const groups = new Map<string, typeof added.data>();
      for (const i of added.data) {
        // deno-lint-ignore no-explicit-any
        const kind = (i as any).lists.kind as string;
        if (i.space !== p.space || i.created_by === p.id || !p[KINDS[kind].pref as keyof Profile]) continue;
        const k = `${kind}:${i.created_by}`;
        groups.set(k, [...(groups.get(k) ?? []), i]);
      }
      for (const [k, items] of groups) {
        const [kind, by] = k.split(':');
        const ids = items.map((i) => i.id).sort();
        outbox.push({ key: `items:${ids.join(',')}:${p.id}`, user: p.id, payload: {
          title: `${byId.get(by)?.name ?? 'Din partner'} har tilføjet til ${KINDS[kind].label}`,
          body: short(items.map((i) => i.text)),
          tag: `items:${kind}`,
        } });
        result.items += items.length;
      }
    }

    // Answers on events, to the event's creator only, never their own. Every change of an
    // answer is its own notification; the tag lets the phone replace the earlier one.
    const answers = await db.from('responses')
      .select('event_id, user_id, status, note, updated_at, events!inner(title, created_by, space)')
      .gt('updated_at', iso(now - HOUR));
    if (answers.error) throw answers.error;
    for (const a of answers.data) {
      // deno-lint-ignore no-explicit-any
      const ev = (a as any).events as { title: string; created_by: string | null; space: string };
      const creator = ev.created_by ? byId.get(ev.created_by) : undefined;
      if (!creator || creator.id === a.user_id || creator.space !== ev.space) continue;
      if (!withDevice.has(creator.id) || !creator.notify_responses) continue;
      outbox.push({ key: `answer:${a.event_id}:${a.user_id}:${a.updated_at}`, user: creator.id, payload: {
        title: `${byId.get(a.user_id)?.name ?? 'Nogen'} ${VERB[a.status] ?? 'har svaret'}`,
        body: `${ev.title}${a.note ? `: "${a.note}"` : ''}`,
        tag: `answer:${a.event_id}:${a.user_id}`,
      } });
    }

    if (!outbox.length) return json(result);

    // Claim: only keys that were not there already come back, and only those are sent.
    const claimed = await db.from('notices_sent')
      .upsert(outbox.map((o) => ({ key: o.key })), { onConflict: 'key', ignoreDuplicates: true })
      .select('key');
    if (claimed.error) throw claimed.error;
    const fresh = new Set(claimed.data.map((c) => c.key));

    const jobs: Promise<void>[] = [];
    for (const o of outbox) {
      if (!fresh.has(o.key)) continue;
      const kind = o.key.split(':')[0];
      if (kind === 'event') result.events += 1;
      if (kind === 'remind') result.reminders += 1;
      if (kind === 'due') result.deadlines += 1;
      if (kind === 'answer') result.answers += 1;
      for (const sub of subs.data) {
        if (sub.user_id !== o.user) continue;
        jobs.push(webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(o.payload),
          { TTL: 12 * 60 * 60 },
        ).then(() => {
          result.sent += 1;
        }).catch(async (err: { statusCode?: number }) => {
          // The push service says this device is gone: forget it.
          if (err.statusCode === 404 || err.statusCode === 410) {
            await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
            result.removed += 1;
          } else {
            console.error('push failed', err.statusCode ?? err);
            result.failed += 1;
          }
        }));
      }
    }
    await Promise.all(jobs);

    // Keep the record small.
    await db.from('notices_sent').delete().lt('sent_at', iso(now - 60 * DAY));
    return json(result);
  } catch (err) {
    console.error(err);
    return json({ error: 'failed', ...result }, 500);
  }
});
