import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { rebuildCanonicalMarket, summarizeCanonicalMarket } from './canonical-market.mjs'

const cwd = process.cwd()
const dbFile = resolve(process.env.BACKSTOP_SALES_DB ?? join(cwd, 'local-data/backstop-sales.sqlite'))

await mkdir(dirname(dbFile), { recursive: true })

if (!existsSync(dbFile)) {
  console.log(
    JSON.stringify(
      {
        available: false,
        dbFile,
        message: 'No sales cache exists yet. Run npm run sales:sync after adding raw or structured comp pulls.',
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

const db = new DatabaseSync(dbFile)

db.exec('BEGIN')
let rebuild
try {
  rebuild = rebuildCanonicalMarket(db)
  db.exec('COMMIT')
} catch (error) {
  db.exec('ROLLBACK')
  db.close()
  throw error
}

const summary = summarizeCanonicalMarket(db)
db.close()

console.log(
  JSON.stringify(
    {
      available: true,
      dbFile,
      rebuild,
      summary,
    },
    null,
    2,
  ),
)
