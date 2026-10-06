/** Idempotent job handlers. Attach to BullMQ/cron in deployment; callable directly in tests. */
export async function sendDayBeforeConfirmations(store, sendMessage, now = new Date()) {
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1); const date = tomorrow.toISOString().slice(0, 10);
  const sent = [];
  for (const booking of await store.bookings()) {
    if (booking.status !== 'confirmed' || !booking.startTime.startsWith(date)) continue;
    const client = await store.client(booking.clientId);
    const message = `Reminder: your appointment is tomorrow at ${booking.startTime.slice(11,16)}. Reply Yes, Reschedule, or Cancel.`;
    await sendMessage(client, message); sent.push({ bookingId: booking.id, message });
  }
  return sent;
}
