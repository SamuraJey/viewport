import React, { useEffect, useRef, useState } from 'react'
import { X, User, Eye, EyeOff } from 'lucide-react'
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
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
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
        // Update auth store including display_name
        login({ id: updated.id, email: updated.email, display_name: updated.display_name }, tokens)
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

  // In-modal two-step delete flow
  const [deleteStep, setDeleteStep] = useState<'initial' | 'password' | 'confirm'>('initial')
  const [deletePassword, setDeletePassword] = useState('')
  const [showDeletePassword, setShowDeletePassword] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const startDelete = () => {
    setDeleteError(null)
    setDeletePassword('')
    setDeleteStep('password')
  }
  const verifyDeletePassword = () => {
    if (!deletePassword) {
      setDeleteError('Please enter your current password')
      return
    }
    // TODO: verify password via API
    setDeleteError(null)
    setDeleteStep('confirm')
  }
  const cancelDelete = () => setDeleteStep('initial')
  const confirmDelete = async () => {
    setDeletingAccount(true)
    try {
      // TODO: call delete endpoint with deletePassword
      alert('Account deletion is not implemented yet.')
      onClose()
    } catch (err) {
      setDeleteError('Failed to delete account')
    } finally {
      setDeletingAccount(false)
    }
  }

  // Reset delete flow when modal closes
  useEffect(() => {
    if (!isOpen) {
      setDeleteStep('initial')
      setDeletePassword('')
      setDeleteError(null)
      setDeletingAccount(false)
    }
  }, [isOpen])
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
               className="w-full mb-4 mt-1 p-2 border rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed opacity-50"
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
             <div className="relative">
               <input
                 id="currentPassword"
                 type={showCurrentPassword ? 'text' : 'password'}
                 value={currentPassword}
                 onChange={e => setCurrentPassword(e.target.value)}
                 className="w-full mb-4 mt-1 p-2 pr-10 border rounded"
               />
               <button
                 type="button"
                 aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                 onClick={() => setShowCurrentPassword(v => !v)}
                 className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-100 transition-colors"
               >
                 {showCurrentPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
               </button>
             </div>
             <label htmlFor="newPassword" className="block text-sm font-medium">New Password</label>
             <div className="relative">
               <input
                 id="newPassword"
                 type={showNewPassword ? 'text' : 'password'}
                 value={newPassword}
                 onChange={e => setNewPassword(e.target.value)}
                 className="w-full mb-4 mt-1 p-2 pr-10 border rounded"
               />
               <button
                 type="button"
                 aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                 onClick={() => setShowNewPassword(v => !v)}
                 className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-100 transition-colors"
               >
                 {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
               </button>
             </div>
             <label htmlFor="confirmPassword" className="block text-sm font-medium">Confirm Password</label>
             <div className="relative">
               <input
                 id="confirmPassword"
                 type={showConfirmPassword ? 'text' : 'password'}
                 ref={confirmPassRef}
                 value={confirmPassword}
                 onChange={e => setConfirmPassword(e.target.value)}
                 className="w-full mb-4 mt-1 p-2 pr-10 border rounded"
               />
               <button
                 type="button"
                 aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                 onClick={() => setShowConfirmPassword(v => !v)}
                 className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-100 transition-colors"
               >
                 {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
               </button>
             </div>
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
        {/* Actions / Delete Confirmation Sections */}
        {deleteStep === 'initial' && (
          <section className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg flex justify-between w-full">
            <button
              onClick={startDelete}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition"
            >
              Delete Account
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md transition"
            >
              Logout
            </button>
          </section>
        )}
        {deleteStep === 'password' && (
          <section className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg space-y-4">
            <p className="text-sm">Please enter your current password to proceed with account deletion.</p>
            <div className="relative">
              <input
                type={showDeletePassword ? 'text' : 'password'}
                placeholder="Current Password"
                value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                className="w-full p-2 pr-10 border rounded"
              />
              <button
                type="button"
                aria-label={showDeletePassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowDeletePassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-100 transition-colors"
              >
                {showDeletePassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {deleteError && <div className="text-red-500 text-sm">{deleteError}</div>}
            <div className="flex justify-between">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md transition"
              >
                Cancel
              </button>
              <button
                onClick={verifyDeletePassword}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md transition"
              >
                Next
              </button>
            </div>
          </section>
        )}
        {deleteStep === 'confirm' && (
          <section className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg space-y-4">
            <p className="text-red-700 font-medium">Are you sure you want to delete your account? This action cannot be undone.</p>
            {deleteError && <div className="text-red-500 text-sm">{deleteError}</div>}
            <div className="flex justify-between">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deletingAccount}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md disabled:opacity-50 transition"
              >
                {deletingAccount ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </section>
        )}
       </div>
     </div>
   )
 }
