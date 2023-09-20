const fs = require('fs');

const fsp = fs.promises;
const path = require('path');
const {Transform} = require('stream');
const SevenZip = require('sevenzip');
const mime = require('mime');

const sz = new SevenZip();

module.exports = fileroot => async (req, res) => {
	try {
		if (req.method === 'HEAD' || req.method === 'OPTIONS') {
			return res.end('');
		}

		if (req.method !== 'GET') {
			res.statusCode = 400;
			return res.end('');
		}

		const url = new URL(req.url, `http://${req.headers.host}`);
		const fullpath = path.join(fileroot, decodeURIComponent(url.pathname));
		const action = url.searchParams.get('action');
		const download = url.searchParams.get('download') === 'true';
		const disposition = download ? 'attachment' : 'inline';
		const stat = await fsp.stat(fullpath);
		stat.filename = path.basename(fullpath);
		stat.directory = stat.isDirectory();
		if (stat.directory) {
			stat.files = [];
			const files = await fsp.readdir(fullpath);
			for (const file of files) {
				const filestat = await fsp.stat(path.join(fullpath, file));
				filestat.filename = file;
				filestat.directory = filestat.isDirectory();
				stat.files.push(filestat);
			}

			res.end(JSON.stringify(stat));
		} else if (action === 'stat') {
			res.end(JSON.stringify(stat));
		} else if (action === 'contents') {
			const sevenZipFiles = await sz.getFiles(fullpath);
			stat.files = parseSevenZip(sevenZipFiles);
			res.end(JSON.stringify(stat));
		} else if (action === 'extract') {
			const extract = url.searchParams.get('extract');
			if (!extract) {
				throw new Error('`extract` param required');
			}

			const estat = await sz.getSingleFile(fullpath, extract);

			res.setHeader('Last-Modified', new Date(stat.mtimeMs).toUTCString());
			res.setHeader('Content-Length', estat.Size);
			res.setHeader('Content-Type', mime.getType(path.extname(extract)));

			let rangeStart = 0;
			let rangeEnd = Infinity;
			if (req.headers.range) {
				const [, units, start, end] = /([^=+])=(\d+)-(\d*)/.exec(req.headers.range);
				if (units === 'bytes') {
					rangeStart = parseInt(start, 10);
					if (end.length) {
						rangeEnd = parseInt(end, 10);
					} else {
						rangeEnd = estat.size;
					}

					res.setHeader('Content-Range', `${units} ${rangeStart}-${rangeEnd - 1}/${estat.size}`);
					res.setHeader('Content-Length', Math.min(rangeEnd - rangeStart, stat.size));
					res.statusCode = 206;
				}
			} else {
				const attachmentFilename = path.basename(fullpath).replace(/"/g, '"');
				res.setHeader('Accept-Ranges', 'bytes');
				res.setHeader('Content-Length', estat.Size);
				res.setHeader('Content-Disposition', `${disposition}; filename="${attachmentFilename}"`);
			}

			const stream = await sz.extractFile(fullpath, extract);
			//stream.pipe(new RangeTransformStream({startOffset: rangeStart, endOffset: rangeEnd})).pipe(res);
      stream.pipe(res);
		} else {
			res.setHeader('Last-Modified', new Date(stat.mtimeMs).toUTCString());
			res.setHeader('Content-Type', mime.getType(path.extname(fullpath)));

			let rangeStart = 0;
			let rangeEnd = Infinity;
			if (req.headers.range) {
				const [, units, start, end] = /([^=]+)=(\d+)-(\d*)/.exec(req.headers.range);
				if (units === 'bytes') {
					rangeStart = parseInt(start, 10);
					if (end.length) {
						rangeEnd = parseInt(end, 10);
					} else {
						rangeEnd = stat.size;
					}

					res.setHeader('Content-Range', `${units} ${rangeStart}-${rangeEnd}/${stat.size}`);
					res.setHeader('Content-Length', Math.min(rangeEnd - rangeStart, stat.size));
					res.statusCode = 206;
				}
			} else {
				const attachmentFilename = path.basename(fullpath).replace(/"/g, '"');
				res.setHeader('Accept-Ranges', 'bytes');
				res.setHeader('Content-Length', stat.size);
				res.setHeader('Content-Disposition', `${disposition}; filename="${attachmentFilename}"`);
			}

			fs.createReadStream(fullpath, {start: rangeStart, end: rangeEnd}).pipe(res);
		}
	} catch (err) {
		const url = new URL(req.url, `http://${req.headers.host}`);
		if (url.pathname !== '/favicon.ico') {
			console.error(new Date(), err);
		}

		res.statusCode = 404;
		res.end(JSON.stringify({error: err.message}));
	}
};

function parseSevenZip(sevenZipFiles) {
	const files = [];
	for (const file of sevenZipFiles) {
		const newFile = {};
    const mTime = new Date(file.Modified);
		newFile.name = file.Path;
		newFile.csize = file['Packed Size'];
		newFile.usize = file.Size;
		newFile.directory = file.Folder === '+';
		newFile.mtime = mTime;
		newFile.mtimeMs = mTime.getTime();
		files.push(newFile);
	}

	return files;
}

class RangeTransformStream extends Transform {
	elapsed = 0;

	finished = false;

	constructor(options) {
		super(options);
		this.startOffest = options.startOffset || 0;
		this.endOffset = options.end || Infinity;
	}

	_transform(chunk, encoding, callback) {
		if (this.finished) {
			this.push(null);
			this.destroy();
			return;
		}

		const chunkSize = chunk.length;
		let chunkToWrite = chunk;
		this.elapsed += chunkSize;
		if (this.elapsed >= this.start) {
			if (this.startOffset - (this.elapsed - chunkSize) > 0) {
				chunkToWrite = chunk.slice(this.startOffset - (this.elapsed - chunkSize));
			}

			if (this.endOffset <= this.elapsed) {
				this.push(chunkToWrite.slice(0, chunkToWrite.length - (this.elapsed - this.endOffset)));
				this.finished = true;
			} else {
				this.push(chunkToWrite);
			}

			callback();
		}
	}
}
