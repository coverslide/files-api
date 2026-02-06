const fs = require('fs')
const path = require('path')
const os = require('os')

class TestFileSystem {
  constructor() {
    this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'files-api-test-'))
    this.testFiles = new Map()
  }

  getTempPath(relativePath = '') {
    return path.join(this.tempDir, relativePath)
  }

  createFile(filePath, content = '') {
    const fullPath = this.getTempPath(filePath)
    const dir = path.dirname(fullPath)

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(fullPath, content)
    this.testFiles.set(filePath, fullPath)
    return fullPath
  }

  createDirectory(dirPath) {
    const fullPath = this.getTempPath(dirPath)
    fs.mkdirSync(fullPath, { recursive: true })
    return fullPath
  }

  createLargeFile(filePath, sizeInBytes) {
    const fullPath = this.getTempPath(filePath)
    const dir = path.dirname(fullPath)

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const buffer = Buffer.alloc(sizeInBytes, 'A')
    fs.writeFileSync(fullPath, buffer)
    this.testFiles.set(filePath, fullPath)
    return fullPath
  }

  getFileStats(filePath) {
    const fullPath = this.getTempPath(filePath)
    return fs.statSync(fullPath)
  }

  exists(filePath) {
    return fs.existsSync(this.getTempPath(filePath))
  }

  cleanup() {
    fs.rmSync(this.tempDir, { recursive: true, force: true })
  }
}

class MockResponse {
  constructor() {
    this.statusCode = 200
    this.headers = {}
    this.body = ''
    this.ended = false
  }

  status(code) {
    this.statusCode = code
    return this
  }

  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value
    return this
  }

  getHeader(name) {
    return this.headers[name.toLowerCase()]
  }

  write(chunk) {
    this.body += chunk.toString()
  }

  end(chunk) {
    if (chunk) {
      this.body += chunk.toString();
    }
    this.ended = true;
  }
    thisEnded = true
  }

  pipe(stream) {
    return stream;
  }
}

class MockSevenZip {
  constructor() {
    this.mockOutputs = new Map()
    this.mockErrors = new Map()
  }

  setMockOutput(command, args, output) {
    const key = `${command}:${args.join(' ')}`
    this.mockOutputs.set(key, output)
  }

  setMockError(command, args, error) {
    const key = `${command}:${args.join(' ')}`
    this.mockErrors.set(key, error)
  }

  async list(filePath) {
    const key = `l:${filePath}`
    if (this.mockErrors.has(key)) {
      throw this.mockErrors.get(key)
    }
    return this.mockOutputs.get(key) || []
  }

  async extract(filePath, options = {}) {
    const key = `e:${filePath}:${options.$extra ? options.$extra.join(' ') : ''}`
    if (this.mockErrors.has(key)) {
      throw this.mockErrors.get(key)
    }
    return this.mockOutputs.get(key) || ''
  }
}

function createMockRequest(options = {}) {
  return {
    method: options.method || 'GET',
    url: options.url || '/',
    headers: options.headers || {},
    query: options.query || {},
  }
}

module.exports = {
  TestFileSystem,
  MockResponse,
  MockSevenZip,
  createMockRequest,
}
