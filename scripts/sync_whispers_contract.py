"""从固定模块契约生成本端类型和校验目录；不修改契约输入。"""
import hashlib
import json
from pathlib import Path
import sys
import subprocess

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1])
manifest = json.loads((source / 'manifest.json').read_text())
for name in ('openapi.json', 'actions.json'):
    expected = manifest['files']['contracts/whispers-v1/' + name]
    if hashlib.sha256((source / name).read_bytes()).hexdigest() != expected:
        raise ValueError('契约指纹不一致')
doc = json.loads((source / 'openapi.json').read_text())
schemas = doc['components']['schemas']
used = set()

def collect(value):
    if isinstance(value, dict):
        if '$ref' in value:
            name = value['$ref'].split('/')[-1]
            if name not in used:
                used.add(name)
                collect(schemas[name])
        for child in value.values():
            collect(child)
    elif isinstance(value, list):
        for child in value:
            collect(child)

def clean(value):
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items() if k not in ('description', 'default', 'title')}
    if isinstance(value, list):
        return [clean(v) for v in value]
    return value

def ts(value):
    if '$ref' in value:
        return value['$ref'].split('/')[-1]
    if 'const' in value:
        return json.dumps(value['const'], ensure_ascii=False)
    if 'enum' in value:
        return ' | '.join(json.dumps(v, ensure_ascii=False) for v in value['enum'])
    if 'oneOf' in value or 'anyOf' in value:
        return '(' + ' | '.join(ts(v) for v in value.get('oneOf', value.get('anyOf'))) + ')'
    kind = value.get('type')
    if kind == 'object':
        if not value['properties']:
            return 'Record<string, never>'
        return '{ ' + '; '.join(k + ('' if k in value.get('required', []) else '?') + ': ' + ts(v) for k, v in value['properties'].items()) + ' }'
    if kind == 'array':
        return '(' + ts(value['items']) + ')[]'
    return {'integer': 'number', 'number': 'number', 'string': 'string', 'boolean': 'boolean', 'null': 'null'}[kind]

operations = {}
inputs = {}
outputs = {}
for path, methods in doc['paths'].items():
    if '/admin/' in path:
        continue
    for method, op in methods.items():
        if 'operationId' not in op:
            continue
        params = [p for p in op.get('parameters', []) if p['in'] != 'header']
        props = {}
        required = []
        for location in ('path', 'query'):
            values = [p for p in params if p['in'] == location]
            if values:
                props[location] = {'type': 'object', 'properties': {p['name']: p['schema'] for p in values}, 'required': [p['name'] for p in values if p.get('required')], 'additionalProperties': False}
                if location == 'path':
                    required.append(location)
        if 'requestBody' in op:
            props['data'] = op['requestBody']['content']['application/json']['schema']
            required.append('data')
        if method != 'get':
            props['key'] = {'type': 'string', 'format': 'uuid', 'pattern': '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'}
            required.append('key')
        input_schema = {'type': 'object', 'properties': props, 'required': required, 'additionalProperties': False}
        response = next(r for code, r in op['responses'].items() if code.startswith('2'))
        response_schema = response.get('content', {}).get('application/json', {}).get('schema')
        data_schema = schemas[response_schema['$ref'].split('/')[-1]]['properties']['data'] if response_schema else None
        collect(input_schema)
        if data_schema:
            collect(data_schema)
        key = op['operationId']
        inputs[key] = ts(input_schema)
        outputs[key] = ts(data_schema) if data_schema else 'void'
        operations[key] = {'path': path, 'method': method.upper(), 'private': bool(op.get('security')) and not any(s == {} for s in op['security']), 'input': clean(input_schema), 'output': clean(data_schema)}
actions = [a for a in json.loads((source / 'actions.json').read_text())['writes'] if a['auth_scope'] == 'student']
header = '// 从固定 whispers/1.0.0 契约生成；使用 scripts/sync_whispers_contract.py 同步，勿手工修改。\n'
types = header + '\n'.join('export type ' + name + ' = ' + ts(schemas[name]) for name in sorted(used))
types += '\nexport interface WhisperInputs {\n' + '\n'.join(k + ': ' + v for k, v in inputs.items()) + '\n}\n'
types += 'export interface WhisperOutputs {\n' + '\n'.join(k + ': ' + v for k, v in outputs.items()) + '\n}\n'
types += 'export type WhisperOperation = keyof WhisperInputs\n'
(root / 'src/types/whispers.ts').write_text(types)
(root / 'src/utils/whispers-contract.ts').write_text(header + 'import type { Schema, OperationSpec } from \'./whispers-schema.ts\'\nexport const whisperSchemas: Record<string, Schema> = ' + json.dumps({k: clean(schemas[k]) for k in sorted(used)}, ensure_ascii=False, indent=2) + '\nexport const whisperOperations: Record<string, OperationSpec> = ' + json.dumps(operations, ensure_ascii=False, indent=2) + '\nexport const whisperWrites = ' + json.dumps(actions, ensure_ascii=False, indent=2) + ' as const\n')
print('已生成学生端契约类型及校验目录，共', len(operations), '项操作')

subprocess.run([str(root / 'node_modules/.bin/prettier'), '--write', 'src/types/whispers.ts', 'src/utils/whispers-contract.ts'], cwd=root, check=True)
