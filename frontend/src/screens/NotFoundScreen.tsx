import { Compass } from 'lucide-react'
import { Link } from 'react-router'
import { Button, EmptyState } from '../components/ui/primitives'

export default function NotFoundScreen() {
  return (
    <EmptyState
      icon={<Compass className="size-6" />}
      title="Page not found"
      description="The page you are looking for does not exist or you do not have access to it."
      action={
        <Link to="/">
          <Button>Go to ward overview</Button>
        </Link>
      }
    />
  )
}
