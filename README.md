# itty.bitty

itty.bitty takes html (or other data), compresses it into a URL fragment, and provides a link that can be shared. When it is opened, it inflates that data on the receiver’s side.

Learn more at: [about.bitty.site](http://about.bitty.site)

How it works: [how.bitty.site](http://how.bitty.site)

For more info: [wiki.bitty.site](https://github.com/alcor/itty-bitty/wiki/)

## Development

```sh
npm ci
npm run serve   # serves docs/ on http://localhost:8080 with the same routing as Netlify
npm run lint
npx playwright install   # once, to download browsers
npm test        # renders links in Chromium, Firefox and WebKit, and tests the Netlify functions
```
