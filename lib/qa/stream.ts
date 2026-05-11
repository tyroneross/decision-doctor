// lib/qa/stream.ts — Q1: SSE response wrapper.
//
// Wraps an AsyncIterable of arbitrary values into a Server-Sent Events
// Response. Each yielded value is JSON-serialised onto a `data:` line.
// The stream closes cleanly when the iterable exhausts or on abort.
//
// Q1 is the first SSE surface in Decision Doctor; /api/chat is non-streaming.

export function createSSEResponse(
  stream: AsyncIterable<unknown>,
  signal?: AbortSignal,
): Response {
  const encoder = new TextEncoder();

  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const value of stream) {
          if (signal?.aborted) break;
          const line = `data: ${JSON.stringify(value)}\n\n`;
          controller.enqueue(encoder.encode(line));
        }
      } catch (err) {
        // Surface error as a final SSE event so the client can surface it.
        const errLine = `data: ${JSON.stringify({ type: "error", message: String(err) })}\n\n`;
        controller.enqueue(encoder.encode(errLine));
      } finally {
        controller.close();
      }
    },
    cancel() {
      // ReadableStream was cancelled (client disconnected). Nothing to clean up
      // here — the for-await above will exit on the next yield because the
      // controller is already closed.
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // CORS passthrough — Next.js route handlers inherit the app's CORS config.
      "X-Accel-Buffering": "no", // Nginx: disable proxy buffering for SSE
    },
  });
}
