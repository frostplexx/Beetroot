import {
  AlertDialog as ShadcnAlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export function AlertDialog({ isOpen, onClose, title, message, variant = 'info' }) {
  const colors = {
    success: 'text-green-400 border-green-900/50 bg-green-950/20',
    error: 'text-red-400 border-red-900/50 bg-red-950/20',
    info: 'text-blue-400 border-blue-900/50 bg-blue-950/20'
  }

  const icons = {
    success: 'fa-circle-check',
    error: 'fa-circle-exclamation',
    info: 'fa-circle-info'
  }

  return (
    <ShadcnAlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded ${colors[variant]}`}>
              <i className={`fa-solid ${icons[variant]} text-xl`}></i>
            </div>
            <div className="flex-1">
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription className="whitespace-pre-line mt-2">
                {message}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>OK</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </ShadcnAlertDialog>
  )
}
