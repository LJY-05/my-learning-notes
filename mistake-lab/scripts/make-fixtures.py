"""Generate clearly labelled synthetic fixtures, never replacements for user scans."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parents[1]/'output'/'test-fixtures'
root.mkdir(parents=True,exist_ok=True)
font='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
for page in [19,20]:
    image=Image.new('RGB',(2600,3600),'white')
    draw=ImageDraw.Draw(image)
    face=ImageFont.truetype(font,55)
    small=ImageFont.truetype(font,32)
    draw.text((140,100),'合成验收夹具，不是用户原图',font=small,fill='#56734a')
    lines=['二、多项选择题','19. 影响人的身心发展的因素主要有（ ）','A. 遗传','B. 环境','C. 教育','D. 个体主观能动性'] if page==19 else ['续页片段：请人工检查阅读顺序。','三、判断题','1. 教育具有文化传递功能。（ ）','四、填空题','1. 教育要尊重学生的________。']
    for i,line in enumerate(lines):draw.text((160,400+i*100),line,font=face,fill='black')
    # Pixel markers make preview resampling distinguishable from original cropping.
    for y in range(350,1100,17):
        for x in range(90,150,7):draw.rectangle((x,y,x+2,y+2),fill=(page*9%255,y%255,x%255))
    draw.text((2200,3430),str(page),font=face,fill='black')
    image.save(root/f'page-{page}.png')
    if page==19:image.crop((155,385,2450,1020)).save(root/'ocr-question.png')
print(root)
