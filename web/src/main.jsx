import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthProvider'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/AppLayout'
import Login from './pages/Login'
import Register from './pages/Register'
import ResetPassword from './pages/ResetPassword'
import VerifyEmail from './pages/VerifyEmail'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import FaithTest from './pages/FaithTest'
import Courses from './pages/Courses'
import Match from './pages/Match'
import Relationships from './pages/Relationships'
import Community from './pages/Community'
import UserTimeline from './pages/UserTimeline'
import Vip from './pages/Vip'
import Pastor from './pages/Pastor'
import Admin from './pages/Admin'
import Chat from './pages/Chat'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename="/app">
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/faith-test" element={<FaithTest />} />
            <Route path="/courses" element={<Courses />} />
            <Route path="/match" element={<Match />} />
            <Route path="/relationships" element={<Relationships />} />
            <Route path="/community" element={<Community />} />
            <Route path="/community/user/:userId" element={<UserTimeline />} />
            <Route path="/vip" element={<Vip />} />
            <Route path="/pastor" element={<Pastor />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/admin" element={<ProtectedRoute role="admin"><Admin /></ProtectedRoute>} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
