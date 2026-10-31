# itty.bitty

itty.bitty takes html (or other data), compresses it into a URL fragment, and provides a link that can be shared. When it is opened, it inflates that data on the receiver’s side.

Learn more at: [about.bitty.site](http://about.bitty.site)

How it works: [how.bitty.site](http://how.bitty.site)

For more info: [wiki.bitty.site](https://github.com/alcor/itty-bitty/wiki/)

## Development

```sh
npm install
npm run dev     # serves the site on http://localhost:8080, the same way Netlify does
npm run lint
npx playwright install   # once, to download browsers
npm test        # renders links in Chromium, Firefox and WebKit, and tests the Netlify functions
```

## Self-hosting

`server/index.mjs` does what Netlify does: serves `docs/`, answers link-preview crawlers, and rasterizes SVG preview images.
The crawler metadata and rasterizing code in `lib/` is shared with the Netlify functions.

### Local runtime prerequisites
- Node.js 20.19 or newer

### Run locally
1. Install dependencies with `npm install`.
2. Start the server with `npm run dev`.
3. Visit `http://localhost:8080`.

Optional environment variables:
- `PORT`: server port (defaults to `8080`).
- `UA_ARRAY`: comma separated list of User-Agents to block with HTTP 401.
- `REQUEST_LOG`: set to `silent` to disable HTTP request logging.

### Docker workflow
1. Build the image locally: `docker build -t itty-bitty .`.
2. Run the container: `docker run --rm -d -p 8080:8080 --name itty-bitty itty-bitty`.
3. Open `http://localhost:8080/` in your browser.
4. Stop it with `docker rm -f itty-bitty` (or let `--rm` clean up if you stop the container normally).

### Docker Compose
```
docker compose up --build -d
```
Stop the stack with `docker compose down` when you are done.
