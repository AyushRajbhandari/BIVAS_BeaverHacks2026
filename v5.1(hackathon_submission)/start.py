import http.server
import os
import socketserver
import subprocess
import sys


FRONTEND_PORT = 8080


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


def main():
    root = os.path.dirname(os.path.abspath(__file__))
    backend_path = os.path.join(root, "app.py")

    backend = subprocess.Popen([sys.executable, backend_path], cwd=root)

    try:
        os.chdir(root)
        handler = http.server.SimpleHTTPRequestHandler

        with ReusableTCPServer(("", FRONTEND_PORT), handler) as httpd:
            print(f"Frontend running at http://localhost:{FRONTEND_PORT}")
            print("Backend running at http://localhost:5000")
            print("Press Ctrl+C to stop both servers.")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping servers...")
    finally:
        backend.terminate()
        try:
            backend.wait(timeout=5)
        except subprocess.TimeoutExpired:
            backend.kill()


if __name__ == "__main__":
    main()
