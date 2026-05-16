# Beetroot UI Design System

A modern, glass-morphism music library interface with dynamic theming and tactile interactions.

## Design Philosophy

**Visual Language**: Modern, minimal, and music-focused. The design prioritizes album artwork and creates immersive experiences through dynamic color extraction and gradient backgrounds.

**Interaction Principles**:
- Subtle but discoverable interactions
- Smooth, performant transitions
- Tactile feedback on all interactive elements
- Progressive enhancement through hover states

**Hierarchy**: Strong typography hierarchy with bold album titles, clear metadata organization, and breathing room between sections.

---

## Color System

### Dynamic Theming

The application uses **dynamic color extraction** from album artwork to create immersive, context-aware backgrounds:

```typescript
// Color extraction from album art
prominent(artUrl, { amount: 5, format: "array" })
  .then(colors => {
    // Select most saturated color
    // Apply as gradient background
  })
```

**Background Pattern**:
```css
linear-gradient(
  180deg,
  rgba(extracted-color, 0.6) 0%,
  rgba(extracted-color, 0.4) 20%,
  rgba(extracted-color, 0.2) 40%,
  transparent 60%
),
#000000
```

### Static Colors

**Base Palette**:
- Background: `#000000` (pure black)
- Text: White with varying opacity
  - Primary text: `white` (100%)
  - Secondary text: `white/90` (90%)
  - Tertiary text: `white/70` (70%)
  - Muted text: `white/60` (60%)
  - Disabled text: `white/40` (40%)

**Glass-morphism Elements**:
- Background: `white/10` - `white/20`
- Borders: `white/10` - `white/30`
- Backdrop blur: `blur-sm` to `blur-md`

---

## Typography

### Font Stack

**Heading Font**: Space Grotesk
- Bold, geometric, modern
- Used for album titles, section headers
- Variable: `--font-heading`

**Body Font**: Inter
- Clean, highly legible
- Used for metadata, descriptions, body text
- Variable: `--font-sans`

**Monospace**: Geist Mono
- Used for technical information if needed
- Variable: `--font-geist-mono`

### Type Scale

**Display** (Album Titles):
```css
font-size: 3rem (48px) mobile
font-size: 3.75rem (60px) desktop
font-weight: 900 (black)
line-height: 1
letter-spacing: -0.025em (tight)
```

**Heading** (Section titles):
```css
font-size: 1.5rem (24px)
font-weight: 600 (semibold)
```

**Body** (Metadata):
```css
font-size: 1.125rem (18px)
font-weight: 400 (regular)
```

**Small** (Labels):
```css
font-size: 0.75rem (12px)
font-weight: 500 (medium)
text-transform: uppercase
letter-spacing: 0.05em (wider)
```

---

## Component Patterns

### Glass-morphism Components

**Base Pattern**:
```css
background: white/10 - white/20
backdrop-filter: blur(4px) - blur(12px)
border: 1px solid white/20 - white/30
border-radius: 0.75rem - 1rem
```

**States**:
- Rest: `bg-white/10 border-white/20`
- Hover: `bg-white/20 border-white/30 scale-105`
- Active: `scale-95`
- Transition: `transition-all duration-200`

### Buttons

#### Primary Button (Edit, Actions)
```css
padding: 0.75rem (12px)
border-radius: 0.75rem (rounded-xl)
background: white/10
border: 1px solid white/20
backdrop-filter: blur-sm

hover:
  background: white/20
  transform: scale(1.1)
  border-color: white/30

active:
  transform: scale(0.95)
```

**Icon Interaction**: Subtle rotation (12deg) on hover

#### Navigation Button (Back)
```css
padding: 0.625rem 1rem
border-radius: 0.75rem
background: white/10
border: 1px solid white/20
backdrop-filter: blur-sm
display: flex
align-items: center
gap: 0.5rem

hover:
  background: white/20
  transform: scale(1.05)
  border-color: white/30
  
  icon:
    transform: translateX(-0.25rem)
```

### Navigation Links

**Active State**:
```css
background: white/20
color: white
border: 1px solid white/30
border-radius: 0.5rem
padding: 0.5rem 1rem
font-weight: 500
```

**Inactive State**:
```css
color: white/70
border: 1px solid transparent
padding: 0.5rem 1rem

hover:
  color: white
  background: white/10
  border-color: white/20
```

### Tags (Genres)

```css
padding: 0.375rem 0.75rem
border-radius: 9999px (full)
background: white/15
border: 1px solid white/20
backdrop-filter: blur-sm
font-size: 0.875rem
font-weight: 500

hover:
  background: white/25
  transform: scale(1.05)
```

**Layout**: Horizontal flex wrap with 0.5rem gap

### Album Artwork

#### Container
```css
width: 24rem (384px) desktop
width: 100% mobile
aspect-ratio: 1/1
perspective: 1000px
```

#### Image
```css
border-radius: 1rem (rounded-2xl)
box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25) (shadow-2xl)
ring: 1px solid white/10
object-fit: cover
```

#### 3D Tilt Effect
```javascript
// Mouse tracking
const rotateX = ((mouseY - centerY) / centerY) * -15
const rotateY = ((mouseX - centerX) / centerX) * 15

// Transform
transform: rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.05)
transform-style: preserve-3d
transition: 0.1s ease-out (hovering) | 0.3s ease-out (leaving)
```

**Interaction**:
- Follows mouse position within ±15 degrees
- Scales to 1.05 on hover
- Fast response (100ms) while hovering
- Gentle return (300ms) when leaving
- Cursor: pointer

---

## Layout Patterns

### Page Container
```css
container: mx-auto
padding: 2rem 1rem (py-8 px-4)
```

### Album Header Layout

**Structure**:
```
┌─────────────────────────────────────────┐
│  [Back Button]                          │
│                                         │
│  ┌──────────┐  ┌────────────────────┐  │
│  │          │  │ Album Title  [Edit]│  │
│  │  Album   │  │                    │  │
│  │   Art    │  │ Artist • Year •    │  │
│  │          │  │ X songs, Y min     │  │
│  │          │  │                    │  │
│  └──────────┘  │ Country: USA       │  │
│                │ Label: Epic        │  │
│                │                    │  │
│                │ [Genre] [Genre]... │  │
│                └────────────────────┘  │
└─────────────────────────────────────────┘
```

**Flexbox**:
```css
display: flex
flex-direction: column (mobile) | row (desktop)
gap: 2.5rem
align-items: flex-start
```

**Info Section**:
```css
flex: 1
display: flex
flex-direction: column
justify-content: flex-start (top-aligned)
gap: 1.5rem (space-y-6)
```

### Metadata Organization

**Primary Metadata** (Inline):
```
Artist • Year • X songs • Y min
```
- Flex wrap
- Gap: 0.75rem horizontal, 0.5rem vertical
- Separator: `•` with `white/40` color
- Font size: 1.125rem

**Secondary Metadata** (Labeled):
```css
display: flex
flex-wrap: wrap
gap: 1.5rem

label:
  color: white/60
  font-size: 0.75rem
  text-transform: uppercase
  letter-spacing: 0.05em
  font-weight: 500

value:
  color: white
  font-weight: 600
```

---

## Navigation

### Header

**Container**:
```css
position: sticky
top: 0
z-index: 50
background: black/60
backdrop-filter: blur-md
border-bottom: 1px solid white/10
```

**Inner**:
```css
container: mx-auto
padding: 1rem 1.5rem (py-4 px-6)
```

**Links**: Horizontal flex with 0.5rem gap

---

## Spacing System

### Vertical Rhythm
- Section spacing: `2rem` (space-y-8)
- Component spacing: `1.5rem` (space-y-6)
- Element spacing: `1rem` (space-y-4)
- Tight spacing: `0.5rem` (space-y-2)

### Horizontal Spacing
- Component gap: `2.5rem` (gap-10)
- Element gap: `1rem` (gap-4)
- Tag gap: `0.5rem` (gap-2)
- Inline gap: `0.75rem` (gap-3)

---

## Animation & Transitions

### Standard Transitions
```css
transition: all 200ms ease-out
```

### Hover Scales
- Buttons: `scale(1.05)` - `scale(1.1)`
- Tags: `scale(1.05)`
- Cards: `scale(1.02)`

### Active Scales
- All interactive: `scale(0.95)`

### Icon Animations
- Rotate: `12deg` on hover
- Translate: `-0.25rem` (chevrons) on hover

### Page Transitions
```css
transition: opacity 1000ms ease-out
```

### 3D Transforms
- Response time (hovering): `100ms ease-out`
- Return time (leaving): `300ms ease-out`
- Preserve 3D: `transform-style: preserve-3d`

---

## Responsive Breakpoints

### Mobile First Approach

**Breakpoints**:
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px

### Key Responsive Patterns

**Album Layout**:
```css
mobile: flex-col, centered artwork
desktop (md+): flex-row, left-aligned artwork
```

**Typography**:
```css
mobile: text-5xl titles
desktop (md+): text-6xl titles
```

**Album Art**:
```css
mobile: w-full (max constrainted by container)
desktop (md+): w-96 (384px fixed)
```

**Navigation**:
```css
mobile: stacked if needed
desktop: horizontal always
```

---

## Accessibility

### Focus States
- Visible focus rings on all interactive elements
- Color: `ring-white/50`
- Offset: 2px

### ARIA Labels
- Icon-only buttons include `aria-label`
- Navigation landmarks properly labeled

### Color Contrast
- Minimum 4.5:1 ratio for body text (white/90 on dark backgrounds)
- 3:1 ratio for large text (titles)
- Interactive elements clearly distinguishable

### Keyboard Navigation
- All interactive elements accessible via keyboard
- Logical tab order
- Enter/Space to activate buttons

---

## Edge Cases & States

### Loading States
- Placeholder for album art: Music icon on muted background
- Opacity transitions for color extraction

### Empty States
- No album art: Rounded container with icon
- No genres: Section hidden
- No metadata: Fields hidden (not shown as "N/A")

### Long Content
- Album titles: Allow wrapping, maintain hierarchy
- Genre lists: Wrap to multiple rows
- Metadata: Flex wrap for responsive layout

---

## Implementation Notes

### Performance Optimizations
- Color extraction cached in localStorage
- Transitions use GPU-accelerated properties (transform, opacity)
- Images use `object-fit: cover` for consistent sizing
- `will-change` avoided (use transforms instead)

### Browser Support
- Modern browsers (last 2 versions)
- CSS Grid and Flexbox
- `backdrop-filter` support required
- `scrollbar-gutter: stable` for layout stability

### Dark Mode
- Design is dark-mode native
- No light mode variant needed
- High contrast available through white/opacity system

---

## Future Considerations

### Potential Enhancements
- Animation on page transitions
- Parallax effects on album artwork
- Audio waveform visualizations
- More dynamic gradient patterns
- Contextual color modes (warm/cool from artwork)

### Scalability
- Design system supports additional components
- Color system can extend to artist pages
- Typography scale accommodates more hierarchy levels
- Glass-morphism pattern reusable across features
