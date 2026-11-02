from fastapi import FastAPI
from fastapi.testclient import TestClient
from admin_web import install_admin_web


def test_admin_deep_links_serve_spa_without_shadowing_api(tmp_path):
    (tmp_path / 'index.html').write_text('<html>Glint admin v26</html>')
    scripts = tmp_path / '_expo'
    scripts.mkdir()
    (scripts / 'entry.js').write_text('console.log("admin")')
    app = FastAPI()
    @app.get('/api/probe')
    def probe():
        return {'api': True}
    assert install_admin_web(app, tmp_path)
    client = TestClient(app)
    for path in ['/admin', '/admin/login', '/admin/user/test-user']:
        response = client.get(path)
        assert response.status_code == 200
        assert 'Glint admin v26' in response.text
        assert response.headers['cache-control'] == 'no-store'
    assert client.get('/api/probe').json() == {'api': True}
    assert client.get('/api/missing').status_code == 404
    assert client.post('/admin/login', json={}).status_code == 405
    assert client.get('/_expo/entry.js').status_code == 200
    assert client.get('/_expo/../index.html').status_code == 404
    assert client.get('/_expo/').status_code == 404


def test_missing_bundle_leaves_existing_routes_alone(tmp_path):
    app = FastAPI()
    assert not install_admin_web(app, tmp_path)
    assert TestClient(app).get('/admin').status_code == 404
