/**
 * Open a print-capable popup without the noopener trap that returns null
 * and leaves thermal / QR print as a blank no-op.
 */

export function openPrintCapableWindow(
  opts?: { width?: number; height?: number; name?: string },
): Window | null {
  const width = opts?.width ?? 380
  const height = opts?.height ?? 720
  const name = opts?.name || '_blank'
  // Do NOT pass noopener/noreferrer in features — that forces window.open → null
  // in Chromium, so document.write / window.print never run.
  const win = window.open(
    '',
    name,
    `width=${width},height=${height},menubar=no,toolbar=no,location=no,status=no,scrollbars=yes`,
  )
  if (!win) return null
  try {
    // Detach opener after we have a live handle (security without blank print)
    win.opener = null
  } catch {
    // ignore
  }
  return win
}

/** Write HTML into a print window; optionally trigger print after paint. */
export function writeAndPrintHtml(
  win: Window,
  html: string,
  delayMs = 280,
  opts?: { autoPrint?: boolean },
): void {
  try {
    win.document.open()
    win.document.write(html)
    win.document.close()
  } catch {
    try {
      win.document.body.innerHTML = html
    } catch {
      // ignore
    }
  }
  if (opts?.autoPrint === false) return
  window.setTimeout(() => {
    try {
      win.focus()
      win.print()
    } catch {
      // ignore
    }
  }, delayMs)
}
