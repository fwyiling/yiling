import re,sys,os
html=open(sys.argv[1],encoding='utf-8').read()
out=sys.argv[2]; os.makedirs(out,exist_ok=True)
for i,m in enumerate(re.finditer(r'<script([^>]*)>(.*?)</script>',html,re.S)):
    attrs,body=m.group(1),m.group(2)
    if 'src=' in attrs or not body.strip(): continue
    p=f'{out}/inline_{i}.js'; open(p,'w').write(body)
    print(p,len(body),attrs.strip()[:60],repr(body.strip()[:120]))
