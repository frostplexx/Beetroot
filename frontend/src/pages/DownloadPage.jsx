import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SearchSection } from '../components/downloads/SearchSection'
import { DownloadQueue } from '../components/downloads/DownloadQueue'

export function DownloadPage() {
  const [activeTab, setActiveTab] = useState('search')

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-neutral-100 mb-2">
          Download Music
        </h1>
        <p className="text-neutral-400">
          Search and download music from enabled extensions
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="search">
            <i className="fa-solid fa-magnifying-glass mr-2"></i>
            Search
          </TabsTrigger>
          <TabsTrigger value="queue">
            <i className="fa-solid fa-list mr-2"></i>
            Download Queue
          </TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="mt-6">
          <SearchSection />
        </TabsContent>

        <TabsContent value="queue" className="mt-6">
          <DownloadQueue />
        </TabsContent>
      </Tabs>
    </div>
  )
}
