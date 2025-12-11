declare module 'sql.js' {
  export interface Statement {
    bind(parameters?: Array<string | number | null>): void
    step(): boolean
    getAsObject(): Record<string, any>
    free(): void
    reset(): void
  }

  export class Database {
    constructor(data?: Uint8Array)
    prepare(sql: string): Statement
    run(sql: string): void
    exec(sql: string): void
    export(): Uint8Array
    close(): void
  }

  export interface InitSqlJsConfig {
    locateFile?: (file: string) => string
  }

  export type SqlJsStatic = {
    Database: typeof Database
  }

  export default function initSqlJs(config?: InitSqlJsConfig): Promise<SqlJsStatic>
}

declare module 'fs' {
  export function readFileSync(path: any): Uint8Array
  const _default: {
    readFileSync: typeof readFileSync
  }
  export default _default
}
