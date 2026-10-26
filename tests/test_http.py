import http.client
import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from scripts.dev import Local

class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),Local)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close()
    def request(self,path,method='GET'):
        c=http.client.HTTPConnection('127.0.0.1',self.server.server_port)
        c.request(method,path);r=c.getresponse();data=r.read();c.close()
        return r,data
    def test_page_and_assets(self):
        for path in ['/','/styles.css','/app.js','/favicon.svg']:
            r,data=self.request(path)
            self.assertEqual(r.status,200)
            self.assertTrue(data)
    def test_real_endpoint(self):
        r,data=self.request('/api/recommend?topic=python&source=catalogue')
        self.assertEqual(r.status,200)
        self.assertEqual(len(json.loads(data)['videos']),5)
        self.assertEqual(r.getheader('Content-Type'),'application/json; charset=utf-8')
    def test_metadata(self):
        r,data=self.request('/api/recommend?action=meta')
        self.assertEqual(r.status,200)
        self.assertEqual(len(json.loads(data)['topics']),8)
    def test_bad_request(self):
        r,data=self.request('/api/recommend?topic=invalid')
        self.assertEqual(r.status,400)
        self.assertIn('error',json.loads(data))
    def test_wrong_method(self):
        r,data=self.request('/api/recommend','POST')
        self.assertEqual(r.status,405)
    def test_long_request(self):
        r,data=self.request('/api/recommend?goal='+'x'*1100)
        self.assertEqual(r.status,400)
