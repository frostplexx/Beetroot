import { Link } from 'react-router-dom'
import { Header } from '../components/common/Header'

export function ToolsPage() {
  const tools = [
    {
      id: 'missing-art',
      name: 'Missing Album Art',
      description: 'Find albums without cover art',
      icon: 'image',
      path: '/tools/missing-art'
    },
    {
      id: 'missing-tracks',
      name: 'Missing Tracks',
      description: 'Find albums with incomplete tracks',
      icon: 'list-check',
      path: '/tools/missing-tracks'
    },
    {
      id: 'duplicates',
      name: 'Find Duplicates',
      description: 'Identify duplicate albums',
      icon: 'copy',
      path: '/tools/duplicates'
    }
  ]

  return (
    <div className="min-h-screen bg-neutral-950">
      <Header />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-light text-neutral-100 mb-8">Library Tools</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tools.map((tool) => (
            <Link
              key={tool.id}
              to={tool.path}
              className="border border-neutral-800 rounded-lg p-6 hover:border-rose-500 transition-colors group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-neutral-900 flex items-center justify-center group-hover:bg-rose-500/10 transition-colors">
                  <i className={`fa-solid fa-${tool.icon} text-xl text-neutral-500 group-hover:text-rose-500`}></i>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-neutral-200 group-hover:text-rose-500 mb-1">
                    {tool.name}
                  </h3>
                  <p className="text-sm text-neutral-500">{tool.description}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
