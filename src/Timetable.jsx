import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { CalendarDays, Check, Trash2, Upload } from 'lucide-react'
import { supabase } from './lib/supabase'

const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
const maxFileSize = 10 * 1024 * 1024

export function TimetableSection({ timetable }) {
  const location = useLocation()
  const [current, setCurrent] = useState(timetable)
  useEffect(() => {
    if (timetable !== undefined || location.pathname !== '/') return undefined
    let cancelled = false
    supabase?.from('timetable').select('*').maybeSingle().then(({ data }) => { if (!cancelled) setCurrent(data || null) })
    return () => { cancelled = true }
  }, [location.pathname, timetable])
  if (location.pathname !== '/') return null
  const activeTimetable = timetable === undefined ? current : timetable
  return <section className="section timetable-section" aria-labelledby="timetable-title">
    <div className="section-heading">
      <div><span className="eyebrow muted">THỜI KHÓA BIỂU</span><h2 id="timetable-title">Thời khóa biểu hiện tại</h2></div>
    </div>
    {activeTimetable?.file_url
      ? <div className="timetable-public-frame"><img src={activeTimetable.file_url} alt="Thời khóa biểu hiện tại" /></div>
      : <div className="timetable-empty"><CalendarDays size={28} /><p>Chưa có thời khóa biểu mới.</p></div>}
  </section>
}

export function TimetableAdminPage() {
  const [timetable, setTimetable] = useState(null)
  useEffect(() => { supabase?.from('timetable').select('*').maybeSingle().then(({ data }) => setTimetable(data || null)) }, [])
  return <TimetableAdmin timetable={timetable} onChange={setTimetable} />
}

export function TimetableAdmin({ timetable, onChange }) {
  const inputRef = useRef(null)
  const [preview, setPreview] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [busy, setBusy] = useState(false)

  const chooseFile = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!allowedTypes.includes(file.type)) return setMessage({ type: 'error', text: 'Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP.' })
    if (file.size > maxFileSize) return setMessage({ type: 'error', text: 'Ảnh thời khóa biểu không được vượt quá 10 MB.' })
    setMessage({ type: '', text: '' })
    setSelectedFile(file)
    setPreview(URL.createObjectURL(file))
  }

  const upload = async () => {
    if (!selectedFile || !supabase) return setMessage({ type: 'error', text: 'Chưa chọn ảnh hoặc Supabase chưa được cấu hình.' })
    setBusy(true)
    setMessage({ type: '', text: '' })
    const extension = selectedFile.name.split('.').pop().toLowerCase()
    const path = `${crypto.randomUUID()}.${extension}`
    try {
      const { error: uploadError } = await supabase.storage.from('timetable').upload(path, selectedFile, { contentType: selectedFile.type, upsert: false })
      if (uploadError) throw uploadError
      const fileUrl = supabase.storage.from('timetable').getPublicUrl(path).data.publicUrl
      const { data, error: saveError } = await supabase.from('timetable').upsert({ singleton: true, file_path: path, file_url: fileUrl, file_name: selectedFile.name }, { onConflict: 'singleton' }).select().single()
      if (saveError) throw saveError
      if (!data) throw new Error('Supabase không trả về thời khóa biểu vừa lưu.')
      onChange(data)
      if (timetable?.file_path) await supabase.storage.from('timetable').remove([timetable.file_path])
      setSelectedFile(null)
      setPreview('')
      if (inputRef.current) inputRef.current.value = ''
      setMessage({ type: 'success', text: 'Đã cập nhật thời khóa biểu.' })
    } catch (error) {
      await supabase.storage.from('timetable').remove([path])
      setMessage({ type: 'error', text: error.message || 'Không thể cập nhật thời khóa biểu.' })
    } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!timetable || !supabase || !window.confirm('Bạn có chắc muốn xóa thời khóa biểu hiện tại?')) return
    setBusy(true)
    setMessage({ type: '', text: '' })
    try {
      const { error: deleteError } = await supabase.from('timetable').delete().eq('id', timetable.id)
      if (deleteError) throw deleteError
      if (timetable.file_path) await supabase.storage.from('timetable').remove([timetable.file_path])
      onChange(null)
      setMessage({ type: 'success', text: 'Đã xóa thời khóa biểu.' })
    } catch (error) { setMessage({ type: 'error', text: error.message || 'Không thể xóa thời khóa biểu.' })
    } finally { setBusy(false) }
  }

  return <main className="timetable-admin-page">
    <div className="admin-title-row"><div><span className="eyebrow muted">NỘI DUNG</span><h1>Quản lý thời khóa biểu</h1><p>Chỉ lưu một ảnh thời khóa biểu hiện tại cho cả lớp.</p></div></div>
    <section className="timetable-admin-panel">
      <div className="panel-heading"><div><h2>Ảnh hiện tại</h2><p>{timetable?.file_name || 'Chưa có ảnh thời khóa biểu.'}</p></div>{timetable && <button className="icon-button danger" title="Xóa thời khóa biểu" onClick={remove} disabled={busy}><Trash2 size={18} /></button>}</div>
      {timetable?.file_url && <img className="timetable-admin-image" src={timetable.file_url} alt="Thời khóa biểu hiện tại" />}
      {preview && <div className="timetable-upload-preview"><span>Ảnh sẽ được cập nhật</span><img src={preview} alt="Preview thời khóa biểu mới" /></div>}
      <div className="timetable-upload-actions"><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} hidden /><button className="outline-button" onClick={() => inputRef.current?.click()} disabled={busy}><Upload size={17} /> Chọn ảnh mới</button><button className="primary-button" onClick={upload} disabled={!selectedFile || busy}><Check size={17} /> {busy ? 'Đang lưu...' : 'Upload thời khóa biểu'}</button></div>
      {message.text && <div className={message.type === 'error' ? 'form-error' : 'form-success'} role="status">{message.text}</div>}
    </section>
  </main>
}
