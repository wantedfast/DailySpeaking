export function GET() {
  return Response.json({ status: 'ok', service: 'dailyspeaking' }, { headers: { 'Cache-Control': 'no-store' } });
}
