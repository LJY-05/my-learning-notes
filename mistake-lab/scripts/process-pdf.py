"""Bounded PDF reader. Document text is data; never execute document content."""
import sys, json, os, subprocess, csv, io
import fitz
path, start, end, ocr = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4] == '1'
doc = fitz.open(path)
if doc.needs_pass:
    raise ValueError('加密 PDF 请先解锁')
if not 1 <= start <= end <= len(doc) or end - start >= 5:
    raise ValueError('请选择有效页范围，每次最多 5 页')
result = {'pageCount': len(doc), 'toc': [{'level':r[0], 'title':r[1], 'pdfPage':r[2]} for r in doc.get_toc()[:300]], 'pages': []}
for index in range(start-1, end):
    page = doc[index]
    if page.rect.is_empty or page.rect.width <= 0 or page.rect.height <= 0:
        raise ValueError('页面尺寸无效')
    scale = min(2, 2400/max(page.rect.width, page.rect.height))
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    import base64
    image = 'data:image/png;base64,' + base64.b64encode(pix.tobytes('png')).decode()
    lines = []
    # Clip-aware extraction uses the displayed coordinate system even for rotated pages.
    for block in page.get_text('dict', sort=True)['blocks']:
        for line in block.get('lines', []):
            text = ''.join(s['text'] for s in line['spans']).strip()
            if not text: continue
            box = fitz.Rect(line['bbox']) * page.rotation_matrix
            x0,y0,x1,y1 = box
            lines.append({'text':text, 'rect':{'x':max(0,x0/page.rect.width),'y':max(0,y0/page.rect.height),'w':min(1,x1/page.rect.width)-max(0,x0/page.rect.width),'h':min(1,y1/page.rect.height)-max(0,y0/page.rect.height)}})
    method = 'pdf-text'
    if sum(len(l['text']) for l in lines) < 20 and ocr:
        png = os.path.join(os.path.dirname(path), 'page.png')
        pix.save(png)
        tessdata = os.environ.get('MISTAKE_LAB_OCR_DATA', '/workspace/.environment-tools/mistake-lab-ocr/tessdata')
        run = subprocess.run(['tesseract', png, 'stdout', '--tessdata-dir', tessdata, '-l', 'chi_sim+eng', '--psm', '3', '-c', 'tessedit_create_tsv=1'], capture_output=True, text=True, timeout=50, check=True, env={**os.environ,'OMP_THREAD_LIMIT':'1'})
        groups = {}
        for row in csv.DictReader(io.StringIO(run.stdout), delimiter='\t'):
            if row['level'] != '5' or not row['text'].strip(): continue
            key = tuple(row[k] for k in ['block_num','par_num','line_num'])
            groups.setdefault(key, []).append(row)
        lines = []
        for words in groups.values():
            x0=min(int(w['left']) for w in words); y0=min(int(w['top']) for w in words)
            x1=max(int(w['left'])+int(w['width']) for w in words); y1=max(int(w['top'])+int(w['height']) for w in words)
            import re
            text = ' '.join(w['text'] for w in words)
            text = re.sub(r'(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])','',text)
            lines.append({'text':text,'rect':{'x':x0/pix.width,'y':y0/pix.height,'w':(x1-x0)/pix.width,'h':(y1-y0)/pix.height}})
        method = 'ocr'
    result['pages'].append({'pdfPage':index+1,'label':page.get_label() or str(index+1),'width':pix.width,'height':pix.height,'image':image,'lines':lines,'method':method})
print(json.dumps(result, ensure_ascii=False))
