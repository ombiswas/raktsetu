import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card.js';
import { Eyebrow } from '../../components/ui/Eyebrow.js';
import { Button } from '../../components/ui/Button.js';

export function NotFoundPage(): React.ReactElement {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-16rem)] p-4">
      <Card className="max-w-md w-full text-center">
        <CardHeader>
          <Eyebrow variant="sunset" className="mb-2">
            HTTP 404 // NOT FOUND
          </Eyebrow>
          <CardTitle>Page Not Found</CardTitle>
          <CardDescription>
            The requested spatial path or resource does not exist in the RaktSetu research registry.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/" className="no-underline">
            <Button variant="primary">Return to Overview</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

export default NotFoundPage;
