const express = require("express");
require("dotenv").config();

const app = express();
const cronHandler = require("./api/cron");

app.get("/api/cron", cronHandler);

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`server listening in port: ${PORT}`);
  });
}
