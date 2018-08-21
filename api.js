const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const targz = require('tar.gz');
const sevenzip = require('sevenzip');

module.exports = (fileroot) => async (req, res) => {
  try {
    if (req.method == "HEAD" || req.method == "OPTIONS") {
      return res.end("");
    } else if (req.method != "GET") {
      res.statusCode = 400;
      return res.end("");
    }
    const url = new URL(req.url, `http://${req.headers.host}`);
    const fullpath = path.join(fileroot, decodeURIComponent(url.pathname));
    const action = url.searchParams.get('action');
    const download = url.searchParams.get('download') === 'true';
    const disposition = download ? 'attachment' : 'inline';
    const stat = await fsp.stat(fullpath);
    stat.filename = path.basename(fullpath);
    stat.directory = stat.isDirectory();
    if (action == "tar") {
      res.setHeader("Content-Disposition", `attachment; filename="${path.basename(fullpath).replace(/\"/g, '\"')}.tar.gz"`)
      targz().createReadStream(fullpath).pipe(res);
    } else if (stat.directory) {
      stat.files = [];
      const files = await fsp.readdir(fullpath);
      for (const file of files) {
        const filestat = await fsp.stat(path.join(fullpath, file));
        filestat.filename = file;
        filestat.directory = filestat.isDirectory();
        stat.files.push(filestat);
      }
      res.end(JSON.stringify(stat));
    } else if (action == "stat") {
      res.end(JSON.stringify(stat));
    } else if (action == "contents") {
      const files = await sevenzip.getFiles(fullpath);
      stat.files = files;
      res.end(JSON.stringify(stat));
    } else if (action == "extract") {
      const extract = url.searchParams.get('extract');
      if (!extract) {
        throw new Error("`extract` param required");
      }
      const extractedPath = await sevenzip.extractFile(fullpath, extract);

      const stat = await fsp.stat(extractedPath);
      res.setHeader("Content-Disposition", `${disposition}; filename="${path.basename(extract).replace(/\"/g, '\"')}"`)
      fs.createReadStream(extractedPath).pipe(res);
    } else {
      res.setHeader("Content-Disposition", `${disposition}; filename="${path.basename(fullpath).replace(/\"/g, '\"')}"`)
      fs.createReadStream(fullpath).pipe(res);
    }
  } catch (err) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname != "/favicon.ico") {
      console.error(new Date(), err);
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: err.message }));
  }
};
