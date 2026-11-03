const { rasterize } = require("../lib/rasterize.cjs");

exports.handler = async function (event) {
  try {
    const jpeg = await rasterize(event.rawQuery);
    return {
      statusCode: 200,
      headers: { "content-type": "image/jpeg" },
      isBase64Encoded: true,
      body: jpeg.toString("base64"),
    };
  } catch (e) {
    return { statusCode: e.status ?? 500, headers: { "content-type": "text/plain" }, body: e.message };
  }
};
