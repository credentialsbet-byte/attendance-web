import './globals.css';

export const metadata = {
  title: 'Office Attendance Tracker',
  description: 'Check-in / check-out with webcam verification',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
