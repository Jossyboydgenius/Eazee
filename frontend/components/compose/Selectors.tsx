'use client'

import { motion } from 'framer-motion'
import { useEazeeStore } from '@/lib/store'
import { POST_TYPES, TONES } from '@/lib/utils'
import { cn } from '@/lib/utils'

export function PostTypeSelector() {
  const { postType, setPostType } = useEazeeStore()

  return (
    <div className="flex flex-wrap gap-2">
      {POST_TYPES.map((type) => (
        <motion.button
          key={type.id}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setPostType(type.id)}
          className={cn('chip', postType === type.id && 'active')}
        >
          <span>{type.emoji}</span>
          <span>{type.label}</span>
        </motion.button>
      ))}
    </div>
  )
}

export function ToneSelector() {
  const { tone, setTone } = useEazeeStore()

  return (
    <div className="flex flex-wrap gap-2">
      {TONES.map((t) => (
        <motion.button
          key={t.id}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setTone(t.id)}
          className={cn('chip', tone === t.id && 'active')}
        >
          <span>{t.emoji}</span>
          <span>{t.label}</span>
        </motion.button>
      ))}
    </div>
  )
}
