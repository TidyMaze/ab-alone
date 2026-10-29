// Dev-server endpoint of the three.js Editor export (#872): the ?lights panel POSTs the live scene as an editor project,
// the Editor (threejs.org/editor/#file=<origin>/__editor/scene.json) GETs it back. Memory only, the last scene wins.
// `apply: 'serve'`: the production build never has it. threejs.org is another origin, and Chrome asks a public page for
// leave to reach localhost (Private Network Access), hence the CORS headers and the preflight answer.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Private-Network': 'true',
};

export function editorScene() {
  let scene = null;
  return {
    name: 'editor-scene',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__editor/scene.json', async (req, res) => {
        for (const [name, value] of Object.entries(CORS)) res.setHeader(name, value);
        if (req.method === 'POST') {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          scene = Buffer.concat(chunks);
          res.statusCode = 204;
          res.end();
        } else if (req.method === 'GET') {
          res.statusCode = scene ? 200 : 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(scene ?? undefined);
        } else {
          res.statusCode = req.method === 'OPTIONS' ? 204 : 405;
          res.end();
        }
      });
    },
  };
}
