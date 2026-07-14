import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const pastor = read('pages/Pastor.jsx')
const admin = read('pages/Admin.jsx')

test('pastor certification submits the complete application payload', () => {
  const application = pastor.match(/pastorCert\.apply\(\{([\s\S]*?)\}\)/)?.[1] || ''

  assert.match(application, /church_name:\s*form\.church_name/)
  assert.match(application, /denomination:\s*form\.presbytery/)
  assert.match(application, /ordination_info:\s*form\.ordination_info/)
  assert.match(application, /contact_email:\s*form\.contact/)
  assert.match(application, /statement:\s*form\.statement/)
})

test('admin pastor review displays the submitted supporting documents', () => {
  const applicationsTab = admin.match(/function ApplicationsTab\(\) \{([\s\S]*?)\n\}\n\nfunction AuditTab/)?.[1] || ''

  assert.match(applicationsTab, /按立信息：\{item\.supporting_docs\?\.ordination_info\s*\|\|\s*'未填写'\}/)
  assert.match(applicationsTab, /事奉说明：\{item\.supporting_docs\?\.statement\s*\|\|\s*'未填写'\}/)
})
