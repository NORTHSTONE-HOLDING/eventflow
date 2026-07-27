// Minimal Word (.doc) exporter using the legacy application/msword HTML wrapper.
// Produces a self-contained document that Word / LibreOffice open natively,
// without any third-party dependency.

export function exportToWord(filename: string, innerHtml: string): void {
  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>${filename}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  @page { size: A4; margin: 2cm; }
  body { font-family: "Cambria", "Georgia", serif; color: #1a1a1a; }
  h1 { font-size: 26pt; letter-spacing: 1px; }
  h2 { font-size: 15pt; border-bottom: 1px solid #999; padding-bottom: 4px; }
  .item { display: flex; justify-content: space-between; margin: 6px 0; }
  .price { font-weight: bold; }
  .allergen-index { font-size: 8pt; color: #555; margin-top: 24px; border-top: 1px solid #ccc; padding-top: 8px; }
</style>
</head>
<body>${innerHtml}</body>
</html>`

  const blob = new Blob(['\ufeff', html], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.doc') ? filename : `${filename}.doc`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}
