const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const targz = require('tar.gz');
const s7z = require('node-7z');
const s7zrun = require('node-7z/util/run');
const tmp = require('tmp');

const fileroot = process.argv[2] || process.env.ROOT || '.';

const server = http.createServer();

const tmpdirAsync = () => new Promise((resolve, reject) => {
  tmp.dir((err, path, callback) => {
    if (err) return reject(err);
    return resolve({ path, callback });
  });
});

server.on('request', async (req, res) => {
  try {
    console.log(new Date(), req.method, req.url);
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
      const zip = new s7z();
      const files = [];
      const task = zip.list(fullpath)
      task.progress(data => {
        for (const file of data) {
          files.push(file);
        }
      })
      const stat = await task;
      stat.files = files;
      res.end(JSON.stringify(stat));
    } else if (action == "extract") {
      const extract = url.searchParams.get('extract');
      if (!extract) {
        throw new Error("`extract` param required");
      }
      const dir = await tmpdirAsync();
      const command = '7z e "' + fullpath + '" "' + extract + '" -o"' + dir.path + '" ';
      const s = await s7zrun(command);

      const extractedPath = path.join(dir.path, extract);
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
});

server.listen(process.env.PORT || 8081);
