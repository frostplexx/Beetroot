import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export function ComponentShowcase() {
  const [isLoading, setIsLoading] = useState(false)
  const [checked, setChecked] = useState(false)
  const [switched, setSwitched] = useState(false)

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-light mb-2 text-foreground">
            shadcn/ui Components Showcase
          </h1>
          <p className="text-muted-foreground">
            All components themed with rose accent colors for Beetroot
          </p>
        </div>

        <Separator />

        {/* Buttons */}
        <Card>
          <CardHeader>
            <CardTitle>Buttons</CardTitle>
            <CardDescription>Various button variants with rose theme</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <Button variant="default">Primary (Rose)</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button disabled>Disabled</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
            <Button
              onClick={() => toast.success('Button clicked!', {
                description: 'This is a toast notification with rose theme'
              })}
            >
              Show Toast
            </Button>
          </CardContent>
        </Card>

        {/* Inputs & Form Elements */}
        <Card>
          <CardHeader>
            <CardTitle>Inputs & Form Elements</CardTitle>
            <CardDescription>Form controls with rose focus rings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="Enter your email" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="select">Select</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="option1">Option 1</SelectItem>
                  <SelectItem value="option2">Option 2</SelectItem>
                  <SelectItem value="option3">Option 3</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox id="terms" checked={checked} onCheckedChange={setChecked} />
              <Label htmlFor="terms">Accept terms and conditions</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch id="notifications" checked={switched} onCheckedChange={setSwitched} />
              <Label htmlFor="notifications">Enable notifications</Label>
            </div>

            <div className="space-y-2">
              <Label>Radio Group</Label>
              <RadioGroup defaultValue="option1">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="option1" id="r1" />
                  <Label htmlFor="r1">Option 1</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="option2" id="r2" />
                  <Label htmlFor="r2">Option 2</Label>
                </div>
              </RadioGroup>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Card>
          <CardHeader>
            <CardTitle>Tabs</CardTitle>
            <CardDescription>Tabbed interface with rose active state</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="albums">
              <TabsList>
                <TabsTrigger value="albums">Albums</TabsTrigger>
                <TabsTrigger value="tracks">Tracks</TabsTrigger>
                <TabsTrigger value="artists">Artists</TabsTrigger>
              </TabsList>
              <TabsContent value="albums" className="mt-4">
                <p className="text-muted-foreground">Albums tab content goes here</p>
              </TabsContent>
              <TabsContent value="tracks" className="mt-4">
                <p className="text-muted-foreground">Tracks tab content goes here</p>
              </TabsContent>
              <TabsContent value="artists" className="mt-4">
                <p className="text-muted-foreground">Artists tab content goes here</p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Badges */}
        <Card>
          <CardHeader>
            <CardTitle>Badges</CardTitle>
            <CardDescription>Status indicators and labels</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge className="bg-rose-500 hover:bg-rose-600">Rose Badge</Badge>
          </CardContent>
        </Card>

        {/* Dialogs */}
        <Card>
          <CardHeader>
            <CardTitle>Dialogs & Modals</CardTitle>
            <CardDescription>Dialog components with rose accents</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-4">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Open Dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Album Metadata</DialogTitle>
                  <DialogDescription>
                    Make changes to album information here. Click save when you're done.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="album">Album Name</Label>
                    <Input id="album" placeholder="Enter album name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="artist">Artist</Label>
                    <Input id="artist" placeholder="Enter artist name" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline">Cancel</Button>
                  <Button>Save Changes</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Delete Album</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the album
                    from your library.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Table</CardTitle>
            <CardDescription>Data table with rose hover effects</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableCaption>A list of your recent albums</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Album</TableHead>
                  <TableHead>Artist</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead className="text-right">Tracks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">The Dark Side of the Moon</TableCell>
                  <TableCell>Pink Floyd</TableCell>
                  <TableCell>1973</TableCell>
                  <TableCell className="text-right">10</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Abbey Road</TableCell>
                  <TableCell>The Beatles</TableCell>
                  <TableCell>1969</TableCell>
                  <TableCell className="text-right">17</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Thriller</TableCell>
                  <TableCell>Michael Jackson</TableCell>
                  <TableCell>1982</TableCell>
                  <TableCell className="text-right">9</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Skeleton Loading */}
        <Card>
          <CardHeader>
            <CardTitle>Skeleton Loading</CardTitle>
            <CardDescription>Loading states for better UX</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          </CardContent>
        </Card>

        {/* Popovers & Tooltips */}
        <Card>
          <CardHeader>
            <CardTitle>Popovers & Tooltips</CardTitle>
            <CardDescription>Contextual information displays</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">Open Popover</Button>
              </PopoverTrigger>
              <PopoverContent>
                <div className="space-y-2">
                  <h4 className="font-medium">Search Syntax Help</h4>
                  <p className="text-sm text-muted-foreground">
                    Use field:value for exact matches
                  </p>
                  <Separator />
                  <div className="text-sm space-y-1">
                    <div><code className="bg-muted px-1 py-0.5 rounded">artist:beatles</code></div>
                    <div><code className="bg-muted px-1 py-0.5 rounded">year:2020..2024</code></div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline">Hover for Tooltip</Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>This is a helpful tooltip</p>
              </TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Actions Menu</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Album Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Play Album</DropdownMenuItem>
                <DropdownMenuItem>Edit Metadata</DropdownMenuItem>
                <DropdownMenuItem>Fetch Album Art</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive">Delete Album</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardContent>
        </Card>

        {/* Scroll Area */}
        <Card>
          <CardHeader>
            <CardTitle>Scroll Area</CardTitle>
            <CardDescription>Scrollable content with custom styled scrollbar</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px] w-full border border-border rounded-md p-4">
              <div className="space-y-4">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div key={i} className="text-sm">
                    <span className="font-medium text-primary">Track {i + 1}:</span> Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Color Palette Reference */}
        <Card>
          <CardHeader>
            <CardTitle>Rose Theme Colors</CardTitle>
            <CardDescription>Current theme color palette</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <div className="bg-primary h-20 rounded-md border border-border"></div>
                <p className="text-sm font-medium">Primary (Rose)</p>
                <p className="text-xs text-muted-foreground">Main accent color</p>
              </div>
              <div className="space-y-2">
                <div className="bg-accent h-20 rounded-md border border-border"></div>
                <p className="text-sm font-medium">Accent (Light Rose)</p>
                <p className="text-xs text-muted-foreground">Secondary accent</p>
              </div>
              <div className="space-y-2">
                <div className="bg-destructive h-20 rounded-md border border-border"></div>
                <p className="text-sm font-medium">Destructive (Red)</p>
                <p className="text-xs text-muted-foreground">Danger actions</p>
              </div>
              <div className="space-y-2">
                <div className="bg-secondary h-20 rounded-md border border-border"></div>
                <p className="text-sm font-medium">Secondary</p>
                <p className="text-xs text-muted-foreground">Neutral gray</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
