import React, { useEffect, useRef, useState } from 'react'
import { X, User } from 'lucide-react'
import { authService } from '../services/authService'
import { useAuthStore } from '../stores/authStore'
import { useNavigate } from 'react-router-dom'

export interface ProfileModalProps {
  isOpen: boolean
  onClose: () => void
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const confirmPassRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const logout = useAuthStore(state => state.logout)
  const tokens = useAuthStore(state => state.tokens)
  const login = useAuthStore(state => state.login)

  // Fetch profile on open
  useEffect(() => {
    if (!isOpen) return
    setError(null)
    authService.getCurrentUser()
      .then(user => {
        setEmail(user.email)
        setDisplayName(user.display_name || '')
        setTimeout(() => firstFieldRef.current?.focus(), 0)
      })
      .catch(err => {
        if (err.response?.status === 401) {
          logout()
          navigate('/auth/login')
        } else {
          setError('Failed to load profile')
        }
      })
  }, [isOpen])

  // Keyboard events
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
      if (e.key === 'Enter') {
        if (document.activeElement === confirmPassRef.current) {
          handlePasswordChange()
        } else {
          handleProfileSave()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, displayName, currentPassword, newPassword, confirmPassword])

  const handleProfileSave = async () => {
    setError(null)
    setSavingProfile(true)
    try {
      const updated = await authService.updateProfile({ display_name: displayName })
      if (tokens) {
        login({ id: updated.id, email: updated.email }, tokens)
      }
      onClose()
    } catch (err: any) {
      if (err.response?.status === 401) {
        logout()
        navigate('/auth/login')
      } else {
        setError('Failed to update profile')
      }
    } finally {
      setSavingProfile(false)
    }
  }

  const handlePasswordChange = async () => {
    setError(null)
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match')
      return
    }
    setChangingPassword(true)
    try {
      await authService.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword
      })
      onClose()
    } catch (err: any) {
      if (err.response?.status === 401) {
        logout()
        navigate('/auth/login')
      } else {
        setError(err.response?.data?.detail || 'Failed to change password')
      }
    } finally {
      setChangingPassword(false)
    }
  }

  const handleLogout = () => {
    logout()
    onClose()
    navigate('/auth/login')
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto bg-black/50 py-6"
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md mx-4 md:mx-0 p-4 md:p-6 relative max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
        >
          <X />
        </button>
        <h2 id="profile-modal-title" className="text-2xl font-semibold mb-4">Account Settings</h2>
        {error && <div className="text-red-500 mb-4">{error}</div>}
        {/* Avatar stub section */}
        <section className="flex flex-col items-center mb-6">
          <div className="w-24 h-24 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-2">
            <User className="w-12 h-12 text-gray-400 dark:text-gray-500" />
          </div>
          <button disabled className="text-sm text-gray-500 dark:text-gray-400">Change Avatar (coming soon)</button>
        </section>
        {/* Profile info section */}
        <section className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg mb-6">
          <h3 className="text-lg font-medium mb-2">Profile Information</h3>
          <form onSubmit={e => { e.preventDefault(); handleProfileSave() }} className="space-y-4">
             <label htmlFor="email" className="block text-sm font-medium">Email</label>
             <input
               id="email"
               type="email"
               value={email}
               readOnly
               className="w-full mb-4 mt-1 p-2 border rounded"
             />
             <label htmlFor="displayName" className="block text-sm font-medium">Display Name</label>
             <input
               id="displayName"
               type="text"
               ref={firstFieldRef}
               value={displayName}
               onChange={e => setDisplayName(e.target.value)}
               className="w-full mb-4 mt-1 p-2 border rounded"
             />
             <button
               type="submit"
               disabled={savingProfile}
               className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 transition"
             >
               {savingProfile ? 'Saving...' : 'Save'}
             </button>
           </form>
         </section>
         <hr className="border-gray-300 dark:border-gray-600 my-4" />
         {/* Password change section */}
         <section className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg mb-6">
           <h3 className="text-lg font-medium mb-2">Change Password</h3>
           <form onSubmit={e => { e.preventDefault(); handlePasswordChange() }}>
             <label htmlFor="currentPassword" className="block text-sm font-medium">Current Password</label>
             <input
               id="currentPassword"
               type="password"
               value={currentPassword}
               onChange={e => setCurrentPassword(e.target.value)}
               className="w-full mb-4 mt-1 p-2 border rounded"
             />
             <label htmlFor="newPassword" className="block text-sm font-medium">New Password</label>
             <input
               id="newPassword"
               type="password"
               value={newPassword}
               onChange={e => setNewPassword(e.target.value)}
               className="w-full mb-4 mt-1 p-2 border rounded"
             />
             <label htmlFor="confirmPassword" className="block text-sm font-medium">Confirm Password</label>
             <input
               id="confirmPassword"
               type="password"
               ref={confirmPassRef}
               value={confirmPassword}
               onChange={e => setConfirmPassword(e.target.value)}
               className="w-full mb-4 mt-1 p-2 border rounded"
             />
             <button
               type="submit"
               disabled={changingPassword}
               className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md disabled:opacity-50 transition"
             >
               {changingPassword ? 'Changing...' : 'Change Password'}
             </button>
           </form>
         </section>
         <hr className="border-gray-300 dark:border-gray-600 my-4" />
         {/* Actions section */}
         <section className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg flex justify-between">
           <button
             onClick={handleLogout}
             className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md transition"
           >
             Logout
           </button>
           <button
             disabled
             className="px-4 py-2 bg-red-600 text-white rounded-md opacity-50 cursor-not-allowed"
           >
             Delete Account
           </button>
         </section>
       </div>
     </div>
   )
 }
