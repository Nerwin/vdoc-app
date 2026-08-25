export type ShellKind = 'posix' | 'powershell'

const SAFE_ARG = /^[A-Za-z0-9_./:@%+=,-]+$/

export function quoteShellArg(arg: string, shell: ShellKind): string {
  if (arg !== '' && SAFE_ARG.test(arg)) return arg
  if (shell === 'powershell') return `'${arg.replaceAll("'", "''")}'`
  return `'${arg.replaceAll("'", `'"'"'`)}'`
}

export function shellCommand(args: string[], shell: ShellKind): string {
  return args.map(arg => quoteShellArg(arg, shell)).join(' ')
}
