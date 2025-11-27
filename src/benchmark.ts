import { readFileSync } from 'fs'
import { mkdtemp, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { Writer as StenoWriter } from 'steno'
import { Writer as StenoxWriter } from './index.js'

async function benchmark(data: string, msg: string): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'benchmark-'))
  
  const fsLabel = '  fs                    '
  const stenoLabel = '  steno                 '
  const stenoxLabel = '  stenox (local)        '
  
  const fsFile = path.join(dir, 'fs.txt')
  const stenoFile = path.join(dir, 'steno.txt')
  const stenoxFile = path.join(dir, 'stenox.txt')
  
  const steno = new StenoWriter(stenoFile)
  const stenox = new StenoxWriter(stenoxFile)

  console.log(msg)
  console.log()

  // fs - sequential writes to avoid race conditions
  console.time(fsLabel)
  for (let i = 0; i < 1000; i++) {
    await writeFile(fsFile, `${data}${i}`)
  }
  console.timeEnd(fsLabel)

  // steno - parallel writes
  console.time(stenoLabel)
  await Promise.all(
    [...Array(1000).keys()].map((_, i) => steno.write(`${data}${i}`)),
  )
  console.timeEnd(stenoLabel)

  // stenox - parallel writes
  console.time(stenoxLabel)
  await Promise.all(
    [...Array(1000).keys()].map((_, i) => stenox.write(`${data}${i}`)),
  )
  console.timeEnd(stenoxLabel)

  // Verify all files have the same final content
  const fsContent = readFileSync(fsFile, 'utf-8')
  const stenoContent = readFileSync(stenoFile, 'utf-8')
  const stenoxContent = readFileSync(stenoxFile, 'utf-8')

  console.log()
  console.log('  Verification:')
  console.log('    fs = steno                 ', fsContent === stenoContent ? '✓' : '✗')
  console.log('    fs = stenox                ', fsContent === stenoxContent ? '✓' : '✗')
  console.log('    All writers match          ', 
    fsContent === stenoContent && 
    fsContent === stenoxContent ? '✓' : '✗')
  console.log()
  console.log('─'.repeat(60))
  console.log()
}

async function benchmarkBurst(data: string, msg: string): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'benchmark-'))
  
  const stenoLabel = '  steno                 '
  const stenoxLabel = '  stenox (local)        '
  
  const stenoFile = path.join(dir, 'steno.txt')
  const stenoxFile = path.join(dir, 'stenox.txt')
  
  const steno = new StenoWriter(stenoFile)
  const stenox = new StenoxWriter(stenoxFile)

  console.log(msg)
  console.log()

  // Burst test - fire all writes at once without waiting
  console.time(stenoLabel)
  const stenoPromises = []
  for (let i = 0; i < 10000; i++) {
    stenoPromises.push(steno.write(`${data}${i}`))
  }
  await Promise.all(stenoPromises)
  console.timeEnd(stenoLabel)

  console.time(stenoxLabel)
  const stenoxPromises = []
  for (let i = 0; i < 10000; i++) {
    stenoxPromises.push(stenox.write(`${data}${i}`))
  }
  await Promise.all(stenoxPromises)
  console.timeEnd(stenoxLabel)

  console.log()
  console.log('─'.repeat(60))
  console.log()
}

async function benchmarkSequential(data: string, msg: string): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'benchmark-'))
  
  const stenoLabel = '  steno                 '
  const stenoxLabel = '  stenox (local)        '
  
  const stenoFile = path.join(dir, 'steno.txt')
  const stenoxFile = path.join(dir, 'stenox.txt')
  
  const steno = new StenoWriter(stenoFile)
  const stenox = new StenoxWriter(stenoxFile)

  // Warmup
  await steno.write('warmup')
  await stenox.write('warmup')

  console.log(msg)
  console.log()

  // Sequential test - wait for each write
  console.time(stenoLabel)
  for (let i = 0; i < 100; i++) {
    await steno.write(`${data}${i}`)
  }
  console.timeEnd(stenoLabel)

  console.time(stenoxLabel)
  for (let i = 0; i < 100; i++) {
    await stenox.write(`${data}${i}`)
  }
  console.timeEnd(stenoxLabel)

  console.log()
  console.log('─'.repeat(60))
  console.log()
}

async function run(): Promise<void> {
  const KB = 1024
  const MB = 1048576

  console.log('═'.repeat(60))
  console.log('File Writer Benchmark Comparison')
  console.log('═'.repeat(60))
  console.log()

  await benchmark(
    Buffer.alloc(KB, 'x').toString(),
    '📝 Parallel: Write 1KB data x 1000',
  )

  await benchmark(
    Buffer.alloc(MB, 'x').toString(),
    '📝 Parallel: Write 1MB data x 1000',
  )

  await benchmarkBurst(
    Buffer.alloc(100, 'x').toString(),
    '⚡ Burst: Write 100B data x 10000 (stress test)',
  )

  console.log()
  console.log('Note: Results may vary due to OS caching and disk I/O.')
  console.log('Run multiple times for best comparison.')
  console.log()
  console.log('✅ Benchmark completed!')
}

void run()
