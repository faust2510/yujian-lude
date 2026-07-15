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

test('pastor certification keeps the application closed until status is ready', () => {
  assert.match(pastor, /useState\('loading'\)/)
  assert.match(pastor, /setCertLoadState\('ready'\)/)
  assert.match(pastor, /setCertLoadState\('error'\)/)

  const applicationCondition = pastor.match(/\{\(([^)]*certLoadState[^)]*)\) && \(\s*<div className="card">\s*<h3[^>]*>申请牧者认证<\/h3>/)?.[1] || ''
  assert.match(applicationCondition, /certLoadState === 'ready'/)
  assert.match(applicationCondition, /canApplyForCertification/)
})

test('pastor certification status error offers retry without opening the application', () => {
  assert.match(pastor, /认证状态加载失败/)
  assert.match(pastor, /onClick=\{loadCertificationStatus\}[^>]*>重新加载<\/button>/)
  assert.doesNotMatch(pastor, /catch\(\(\) => setStatus\(\{ certification: null \}\)\)/)
})

test('a rejected pastor certification can be corrected and submitted again', () => {
  const applicationCondition = pastor.match(/\{\(([^)]*certLoadState[^)]*)\) && \(\s*<div className="card">\s*<h3[^>]*>申请牧者认证<\/h3>/)?.[1] || ''
  assert.match(pastor, /const canApplyForCertification = !status\?\.certification \|\| certState === 'rejected'/)
  assert.match(applicationCondition, /canApplyForCertification/)
})

test('admin pastor review displays the submitted supporting documents', () => {
  const applicationsTab = admin.match(/function ApplicationsTab\(\) \{([\s\S]*?)\n\}\n\nfunction AuditTab/)?.[1] || ''

  assert.match(applicationsTab, /按立信息：\{item\.supporting_docs\?\.ordination_info\s*\|\|\s*'未填写'\}/)
  assert.match(applicationsTab, /事奉说明：\{item\.supporting_docs\?\.statement\s*\|\|\s*'未填写'\}/)
})
