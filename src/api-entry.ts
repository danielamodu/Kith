// Vercel's Node runtime imports this file and calls the default export as
// the request handler for every path routed here by vercel.json — it's the
// same Express app that npm run web serves locally, just not calling
// .listen() on Vercel (see the guard at the bottom of src/server.ts).
export { default } from "./server.ts";
