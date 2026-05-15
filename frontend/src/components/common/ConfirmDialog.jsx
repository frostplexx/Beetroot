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
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line">
            {message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
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
