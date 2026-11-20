# usage: python3 addnames.py '{"mangled": "name", ...}'  — merges into names.json
import json, sys
m = json.load(open('names.json')); new = json.loads(sys.argv[1])
for k in new:
    if k in m: print('already named:', k, m[k])
m.update(new); json.dump(m, open('names.json', 'w'), indent=1)
print(len(m), 'names')
