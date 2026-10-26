"""Local server mirrors Vercel's static files and Python API."""
import sys
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from api.recommend import handler
PUBLIC = Path(__file__).resolve().parents[1] / 'public'
class Local(SimpleHTTPRequestHandler, handler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)
    def do_GET(self):
        if self.path.split('?')[0] == '/api/recommend':
            return handler.do_GET(self)
        return SimpleHTTPRequestHandler.do_GET(self)
if __name__ == '__main__':
    print('YTGuide: http://localhost:3000', flush=True)
    ThreadingHTTPServer(('0.0.0.0', 3000), Local).serve_forever()
