"""Synthetic canonical execution host; it never calls a model provider."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json


class CanonicalHostHandler(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802 - standard library handler method
        if self.path != "/generate":
            self.send_error(404)
            return
        length = int(self.headers.get("content-length", "0"))
        request = json.loads(self.rfile.read(length))
        if sorted(request) != [
            "cases",
            "datasetId",
            "datasetVersion",
            "generationSpec",
            "schemaVersion",
        ]:
            self.send_error(400, "expected TutorExecutionPacket fields")
            return
        if len(request["cases"]) != 1:
            self.send_error(400, "expected one packet case")
            return
        execution_case = request["cases"][0]
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(
            json.dumps(
                {
                    "output": {
                        "text": f"Synthetic canonical response for {execution_case['caseId']}."
                    },
                    "executionSupport": {"maxOutputTokens": True},
                }
            ).encode("utf-8")
        )

    def log_message(self, _format, *_args):
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 9000), CanonicalHostHandler)
    print("Synthetic canonical host listening on http://127.0.0.1:9000/generate")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
