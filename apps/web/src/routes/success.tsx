import { useSearchParams } from "react-router";

export default function SuccessPage() {
  const [searchParams] = useSearchParams();
  const session_id = searchParams.get("session_id");

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-4 font-bold text-2xl">Payment Successful!</h1>
      <p className="mb-4 text-gray-600">
        Thank you for your purchase. Your payment has been processed successfully.
      </p>
      {session_id && <p className="text-gray-500 text-sm">Session ID: {session_id}</p>}
    </div>
  );
}
