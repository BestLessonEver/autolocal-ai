/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Client {
  id: string
  business_name: string
  owner_name: string | null
  email: string
  phone: string | null
  website: string | null
  package: string | null
  status: string
  stripe_customer_id: string | null
  created_at: string
  city?: string
  state?: string
}

interface Preview {
  id: string
  slug: string
  business_name: string
  city: string | null
  state: string | null
  phone: string | null
  email: string | null
  category: string
  google_rating: number | null
  google_review_count: number
  status: string
  template: string
  created_at: string
  view_count: number
  hosting_status: string | null
  cancel_date: string | null
  trial_end: string | null
  stripe_customer_id: string | null
  custom_domain: string | null
}

const STATUS_COLORS: Record<string, string> = {
  onboarding: 'bg-yellow-500/20 text-yellow-400',
  active: 'bg-green-500/20 text-green-400',
  published: 'bg-green-500/20 text-green-400',
  deployed: 'bg-blue-500/20 text-blue-400',
  paused: 'bg-gray-500/20 text-gray-400',
  draft: 'bg-gray-500/20 text-gray-400',
}

const PACKAGE_LABELS: Record<string, string> = {
  starter: 'Free Website',
  living: 'Legacy Living',
  social_revive: 'Legacy Social',
  growth: 'Legacy Growth',
}

export default function AdminClientsPage() {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [previews, setPreviews] = useState<Preview[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'previews' | 'clients'>('previews')
  const [search, setSearch] = useState('')
  const [deploying, setDeploying] = useState<string | null>(null)
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null)
  const [editingEmail, setEditingEmail] = useState<string | null>(null)
  const [editEmailValue, setEditEmailValue] = useState('')

  const loadData = useCallback(async () => {
    try {
      const [clientsRes, previewsRes] = await Promise.all([
        fetch('/api/admin/clients'), fetch('/api/admin/previews'),
      ])
      if (clientsRes.status === 401 || previewsRes.status === 401) {
        router.push('/login?next=%2Fadmin%2Fclients')
        return
      }
      if (clientsRes.ok) setClients(await clientsRes.json())
      if (previewsRes.ok) setPreviews(await previewsRes.json())
    } catch {
      alert('Could not load administration data. Please try again.')
    } finally { setLoading(false) }
  }, [router])

  async function updateEmail(id: string) {
    const res = await fetch('/api/admin/previews', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, email: editEmailValue.trim() || null }),
    })
    if (res.ok) {
      setEditingEmail(null)
      loadData()
    } else {
      alert('Failed to update email')
    }
  }

  async function deleteSite(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    const res = await fetch('/api/admin/previews', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) {
      loadData()
    } else {
      alert('Failed to delete')
    }
  }

  useEffect(() => { const timer = setTimeout(() => void loadData(), 0); return () => clearTimeout(timer) }, [loadData])


  const filteredPreviews = previews.filter(p =>
    p.business_name.toLowerCase().includes(search.toLowerCase()) ||
    p.slug.toLowerCase().includes(search.toLowerCase()) ||
    (p.city || '').toLowerCase().includes(search.toLowerCase())
  )

  const filteredClients = clients.filter(c =>
    c.business_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.owner_name || '').toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-black">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">AutoLocal</span>
              <span className="text-gray-500">.ai</span>
            </Link>
            <span className="text-gray-600 text-sm">/ Admin</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={loadData}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-white border border-white/10 rounded-lg hover:border-white/20 transition"
            >
              ↻ Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <p className="text-3xl font-black text-white">{previews.length}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wide mt-1">Previews</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <p className="text-3xl font-black text-white">{previews.filter(p => p.email).length}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wide mt-1">Leads (w/ email)</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <p className="text-3xl font-black text-white">{previews.reduce((sum, p) => sum + (p.view_count || 0), 0)}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wide mt-1">Total Views</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <p className="text-3xl font-black text-white">{previews.filter(p => p.hosting_status === 'active' || p.hosting_status === 'pending_cancel').length}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wide mt-1">Hosting Active</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <p className="text-3xl font-black text-green-400">${previews.filter(p => (p.hosting_status === 'active' || p.hosting_status === 'pending_cancel') && p.trial_end && new Date(p.trial_end) < new Date()).length * 9}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wide mt-1">MRR</p>
          </div>
        </div>

        {/* Tabs + Search */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
            <button
              onClick={() => setTab('previews')}
              className={`px-4 py-2 rounded-md text-sm font-semibold transition ${
                tab === 'previews' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              All Sites ({previews.length})
            </button>
            <button
              onClick={() => setTab('clients')}
              className={`px-4 py-2 rounded-md text-sm font-semibold transition ${
                tab === 'clients' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Leads ({previews.filter(p => p.email).length})
            </button>
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:border-indigo-500 outline-none text-sm w-full sm:w-64"
          />
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500">Loading...</p>
          </div>
        ) : tab === 'previews' ? (
          /* Previews Table */
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Business</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Domain</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Location</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Rating</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Views</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Hosting</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Created</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Cancel Date</th>
                    <th className="text-right px-4 py-3 text-gray-500 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPreviews.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-gray-500">
                        No previews yet. Generate one from the homepage or pipeline script.
                      </td>
                    </tr>
                  ) : filteredPreviews.map(p => (
                    <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02] transition">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-white">{p.business_name}</p>
                        {editingEmail === p.id ? (
                          <div className="flex items-center gap-1 mt-1">
                            <input
                              type="email"
                              value={editEmailValue}
                              onChange={e => setEditEmailValue(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') updateEmail(p.id); if (e.key === 'Escape') setEditingEmail(null) }}
                              className="px-2 py-0.5 rounded bg-white/10 border border-white/20 text-xs text-white w-48 outline-none focus:border-indigo-500"
                              autoFocus
                            />
                            <button onClick={() => updateEmail(p.id)} className="text-green-400 text-xs hover:text-green-300">✓</button>
                            <button onClick={() => setEditingEmail(null)} className="text-gray-500 text-xs hover:text-gray-300">✕</button>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 cursor-pointer hover:text-indigo-400 transition" onClick={() => { setEditingEmail(p.id); setEditEmailValue(p.email || '') }}>
                            {p.email || <span className="italic text-gray-600">no email — click to add</span>}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <a href={p.custom_domain ? `https://${p.custom_domain}` : `/preview/${p.slug}`} target="_blank" className="text-indigo-400 hover:text-indigo-300 text-xs">
                          {p.custom_domain || p.slug}
                        </a>
                        {!p.custom_domain && p.hosting_status === 'active' && (
                          <button
                            onClick={async () => {
                              const domain = prompt('Enter custom domain (e.g. mybusiness.com):')
                              if (!domain) return
                              const res = await fetch('/api/admin/previews', {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: p.id, custom_domain: domain }),
                              })
                              if (res.ok) {
                                setPreviews(prev => prev.map(x => x.id === p.id ? { ...x, custom_domain: domain } : x))
                              }
                            }}
                            className="block text-[10px] text-gray-600 hover:text-indigo-400 transition mt-0.5"
                          >
                            + add domain
                          </button>
                        )}
                        {p.custom_domain && (
                          <span className="block text-[10px] text-gray-600">{p.slug}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {p.city}{p.state ? `, ${p.state}` : ''}
                      </td>
                      <td className="px-4 py-3">
                        {p.google_rating ? (
                          <span className="text-yellow-400">★ {p.google_rating}</span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                        {p.google_review_count >= 20 && (
                          <span className="text-gray-500 text-xs ml-1">({p.google_review_count})</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400">{p.view_count || 0}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          p.hosting_status === 'active' ? 'bg-green-500/20 text-green-400' :
                          p.hosting_status === 'pending_cancel' ? 'bg-orange-500/20 text-orange-400' :
                          p.hosting_status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                          p.hosting_status === 'preview' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {p.hosting_status || 'preview'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {p.cancel_date ? (
                          <span className="text-orange-400">{new Date(p.cancel_date).toLocaleDateString()}</span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={`/my-site/${p.id.slice(0, 8)}-${p.slug}`}
                            target="_blank"
                            className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-xs text-gray-300 hover:border-white/20 hover:text-white transition"
                          >
                            Dashboard
                          </a>
                          <a
                            href={`/preview/${p.slug}`}
                            target="_blank"
                            className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-xs text-gray-300 hover:border-white/20 hover:text-white transition"
                          >
                            Preview
                          </a>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`https://autolocal.ai/preview/${p.slug}`)
                              alert('Link copied!')
                            }}
                            className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-xs text-gray-300 hover:border-white/20 hover:text-white transition"
                          >
                            Copy Link
                          </button>
                          <a
                            href={`/offer?business=${encodeURIComponent(p.business_name)}`}
                            target="_blank"
                            className="px-2.5 py-1 rounded-md bg-indigo-600/20 border border-indigo-500/30 text-xs text-indigo-400 hover:bg-indigo-600/30 transition"
                          >
                            Send Offer
                          </a>
                          <button
                            onClick={() => deleteSite(p.id, p.business_name)}
                            className="px-2.5 py-1 rounded-md bg-red-600/10 border border-red-500/20 text-xs text-red-400 hover:bg-red-600/20 transition"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Leads Table — grouped by email */
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Email</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Sites</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Phone</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Location</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Revenue</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Since</th>
                    <th className="text-right px-4 py-3 text-gray-500 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const grouped = new Map<string, Preview[]>()
                    previews.filter(p => p.email).forEach(p => {
                      const key = p.email!.toLowerCase()
                      if (!grouped.has(key)) grouped.set(key, [])
                      grouped.get(key)!.push(p)
                    })
                    const entries = Array.from(grouped.entries()).filter(([email, sites]) =>
                      email.includes(search.toLowerCase()) ||
                      sites.some(s => s.business_name.toLowerCase().includes(search.toLowerCase()))
                    )
                    if (entries.length === 0) return (
                      <tr><td colSpan={7} className="text-center py-12 text-gray-500">No leads yet.</td></tr>
                    )
                    return entries.map(([email, sites]) => {
                      const primary = sites[0]
                      const extra = sites.length - 1
                      const activeCount = sites.filter(s => s.hosting_status === 'active' || s.hosting_status === 'pending_cancel').length
                      const isExpanded = expandedEmail === email
                      return (
                        <React.Fragment key={email}>
                          <tr className="border-b border-white/5 hover:bg-white/[0.02] transition cursor-pointer" onClick={() => setExpandedEmail(isExpanded ? null : email)}>
                            <td className="px-4 py-3">
                              <a href={`mailto:${email}`} className="text-indigo-400 hover:text-indigo-300 text-sm" onClick={e => e.stopPropagation()}>{email}</a>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-semibold text-white text-xs">{primary.business_name}</span>
                              {extra > 0 && (
                                <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600/30 text-indigo-400">+{extra} more</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-400 text-xs">{primary.phone || '—'}</td>
                            <td className="px-4 py-3 text-gray-400 text-xs">{primary.city}{primary.state ? `, ${primary.state}` : ''}</td>
                            <td className="px-4 py-3">
                              {(() => {
                                const now = new Date()
                                const paying = sites.filter(s =>
                                  (s.hosting_status === 'active' || s.hosting_status === 'pending_cancel') &&
                                  s.trial_end && new Date(s.trial_end) < now
                                )
                                const onTrial = sites.filter(s =>
                                  (s.hosting_status === 'active' || s.hosting_status === 'pending_cancel') &&
                                  (!s.trial_end || new Date(s.trial_end) >= now)
                                )
                                return (
                                  <div className="flex flex-col gap-0.5">
                                    {paying.length > 0 && (
                                      <span className="text-green-400 text-xs font-semibold">${paying.length * 9}/mo</span>
                                    )}
                                    {onTrial.length > 0 && (
                                      <span className="text-yellow-400 text-[10px]">🆓 {onTrial.length} on trial</span>
                                    )}
                                    {paying.length === 0 && onTrial.length === 0 && (
                                      <span className="text-gray-600 text-xs">$0</span>
                                    )}
                                  </div>
                                )
                              })()}
                            </td>
                            <td className="px-4 py-3 text-gray-500 text-xs">{new Date(primary.created_at).toLocaleDateString()}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(email); alert('Email copied!') }} className="px-2.5 py-1 rounded-md bg-indigo-600/20 border border-indigo-500/30 text-xs text-indigo-400 hover:bg-indigo-600/30 transition">
                                  Copy Email
                                </button>
                                <button onClick={async e => { e.stopPropagation(); if (!confirm(`Delete ALL ${sites.length} site(s) for ${email}?`)) return; for (const s of sites) { await fetch('/api/admin/previews', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id }) }) }; loadData() }} className="px-2.5 py-1 rounded-md bg-red-600/10 border border-red-500/20 text-xs text-red-400 hover:bg-red-600/20 transition">
                                  Delete
                                </button>
                                {sites.length > 1 && (
                                  <span className="text-gray-500 text-xs">{isExpanded ? '▲' : '▼'}</span>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isExpanded && sites.map(s => (
                            <tr key={s.id} className="border-b border-white/5 bg-white/[0.01]">
                              <td className="px-4 py-2 pl-8 text-gray-600 text-xs">↳</td>
                              <td className="px-4 py-2">
                                <span className="text-white text-xs">{s.business_name}</span>
                                <span className="text-gray-600 text-xs ml-2">({s.template})</span>
                              </td>
                              <td className="px-4 py-2 text-gray-500 text-xs">{s.category}</td>
                              <td className="px-4 py-2 text-gray-500 text-xs">{s.city}{s.state ? `, ${s.state}` : ''}</td>
                              <td className="px-4 py-2">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  s.hosting_status === 'active' ? 'bg-green-500/20 text-green-400' :
                                  s.hosting_status === 'pending_cancel' ? 'bg-orange-500/20 text-orange-400' :
                                  s.hosting_status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                                  'bg-yellow-500/20 text-yellow-400'
                                }`}>{s.hosting_status || 'preview'}</span>
                              </td>
                              <td className="px-4 py-2 text-gray-500 text-xs">{new Date(s.created_at).toLocaleDateString()}</td>
                              <td className="px-4 py-2 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <a href={`/my-site/${s.id.slice(0, 8)}-${s.slug}`} target="_blank" className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-gray-300 hover:text-white transition">
                                    Dashboard
                                  </a>
                                  <button onClick={() => deleteSite(s.id, s.business_name)} className="px-2 py-0.5 rounded-md bg-red-600/10 border border-red-500/20 text-[10px] text-red-400 hover:bg-red-600/20 transition">
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
