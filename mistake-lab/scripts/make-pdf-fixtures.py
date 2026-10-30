"""Synthetic PDF fixtures only. Not derived from or a substitute for user files."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.lib.utils import ImageReader
out=Path('output/test-fixtures');out.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
def page(c, lines):
    c.setFont('STSong-Light',14)
    for i,line in enumerate(lines): c.drawString(42,790-i*32,line)
    c.showPage()
c=canvas.Canvas(str(out/'synthetic-workbook.pdf'),pagesize=(595,842))
c.bookmarkPage('chapter1');c.addOutlineEntry('第一章 合成验收','chapter1',0)
page(c,['一、单项选择题','1. 教育的文化功能是（ ）','A. 传递文化','B. 决定遗传','C. 消除差异','D. 替代生活','二、多项选择题','1. 下列属于教育文化功能的是（ ）','A. 传递文化','B. 选择文化'])
page(c,['C. 创造文化','D. 遗传决定','三、判断题','1. 教育能够促进个体发展。（ ）','四、填空题','1. 尊重个体差异，做到________。'])
c.bookmarkPage('chapter2');c.addOutlineEntry('第二章 同号题','chapter2',0)
page(c,['一、单项选择题','1. 第二章同号题，请勿与第一章答案混淆。（ ）','A. 原则','B. 方法','C. 评价','D. 环境'])
c.save()
c=canvas.Canvas(str(out/'synthetic-answers.pdf'),pagesize=(595,842))
page(c,['一、单项选择题','1. A 【解析】教育具有传递文化的功能。','二、多项选择题','1. ABC 【解析】传递、选择和创造文化。','三、判断题','1. V 【解析】教育促进人的发展。','四、填空题','1. 因材施教 【解析】尊重个体差异。'])
c.save()
c=canvas.Canvas(str(out/'synthetic-scanned.pdf'),pagesize=(595,842))
c.drawImage(ImageReader(str(out/'page-19.png')),0,0,width=595,height=842);c.showPage();c.save()

import subprocess
r=subprocess.run(['python3','scripts/process-pdf.py',str(out/'synthetic-workbook.pdf'),'1','2','0'],capture_output=True,text=True,check=True)
(out/'pdf-inspection.json').write_text(r.stdout)
