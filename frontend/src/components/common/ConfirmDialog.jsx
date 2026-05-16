import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

export function ConfirmDialog({ isOpen, onClose, title, message, buttons }) {
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="dark bg-neutral-900 border border-neutral-800 text-neutral-100 max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-neutral-100 text-lg">{title}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line text-neutral-400 text-sm">
            {message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="border-neutral-800 bg-neutral-950/50">
          {buttons.map((button, index) => (
            <Button
              key={index}
              onClick={() => {
                button.onClick()
                onClose()
              }}
              variant={
                button.variant === 'danger'
                  ? 'destructive'
                  : button.variant === 'primary'
                  ? 'default'
                  : 'secondary'
              }
            >
              {button.label}
            </Button>
          ))}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
