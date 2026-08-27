// 可排序表头：点击切换 asc/desc，显示排序方向指示。
// 复用于供应商 / 模型 / 任务记录三个管理表格。
interface Props {
  label: string
  field: string
  current: string
  order: 'asc' | 'desc'
  onSort: (field: string) => void
  align?: 'left' | 'right'
}

export default function SortableTh({ label, field, current, order, onSort, align = 'left' }: Props) {
  const active = current === field
  const icon = active ? (order === 'asc' ? '▲' : '▼') : '⇅'
  return (
    <th
      className={`px-4 py-3 text-${align} select-none cursor-pointer hover:text-gray-700 transition`}
      onClick={() => onSort(field)}
      title={`按${label}排序`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={`text-[10px] ${active ? 'text-brand-600' : 'text-gray-300'}`}>{icon}</span>
      </span>
    </th>
  )
}
