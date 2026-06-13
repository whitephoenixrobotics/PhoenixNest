'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, GitBranch, Loader2, ArrowLeft } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { projectsApi, flowsApi } from '@/lib/api-client'
import { uiPrompt } from '@/lib/dialog'
import type { Project, Flow } from '@/types'

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<Project | null>(null)
  const [flows, setFlows] = useState<Flow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([projectsApi.get(id), flowsApi.list(id)]).then(([pRes, fRes]) => {
      setProject(pRes.data)
      setFlows(fRes.data)
      setLoading(false)
    })
  }, [id])

  const createFlow = async () => {
    const name = await uiPrompt('Flow name:')
    if (!name) return
    const res = await flowsApi.create(id, { name })
    setFlows((prev) => [res.data, ...prev])
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950 text-zinc-400">
        <Loader2 size={20} className="animate-spin mr-2" /> Loading...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="p-1.5 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex items-center gap-2">
          <Logo size={20} />
          <span className="text-zinc-500">PhoenixFlow</span>
          <span className="text-zinc-600">›</span>
          <span className="font-semibold text-zinc-100">{project?.name}</span>
        </div>
        <div className="flex-1" />
        <button
          onClick={createFlow}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={14} /> New Flow
        </button>
      </header>

      <main className="p-6">
        <h2 className="text-xl font-semibold mb-6">Flows</h2>
        {flows.length === 0 ? (
          <div className="text-center py-16 text-zinc-500">
            <GitBranch size={40} className="mx-auto mb-3 opacity-50" />
            <p>No flows yet. Create your first flow!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {flows.map((f) => (
              <Link
                key={f.id}
                href={`/flows/${f.id}`}
                className="block p-5 bg-zinc-900 border border-zinc-800 hover:border-violet-500 rounded-xl transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-violet-500/10 rounded-lg group-hover:bg-violet-500/20 transition-colors">
                    <GitBranch size={20} className="text-violet-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold group-hover:text-white">{f.name}</h3>
                    <p className="text-xs text-zinc-500 mt-1">
                      {f.definition.nodes.length} nodes · {f.definition.edges.length} edges
                    </p>
                    <p className="text-xs text-zinc-600 mt-2">
                      {new Date(f.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
