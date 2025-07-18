import React, { useState, useEffect, useMemo } from 'react'
import {
  Box,
  VStack,
  HStack,
  SimpleGrid,
  Image,
  Heading,
  Text,
  Button,
  Spinner,
  Alert,
  IconButton,
  Portal,
  Select,
  createListCollection,
  Popover,
  Fieldset,
  Checkbox,
  CheckboxGroup,
  RadioGroup,
  Flex
} from '@chakra-ui/react'
import {
  FaCheck,
  FaChevronUp,
  FaChevronDown,
  FaTimes,
  FaFilter,
  FaGlobe,
  FaVenusMars,
  FaSort,
  FaSortAmountUp,
  FaSortAmountDown
} from 'react-icons/fa'
import { supabase } from '../../api/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import BookDetailModal from '../../components/Books/BookDetailModal'

export default function Voting({ onClose, onVoted }) {
  const { user } = useAuth()
  const displayName = user.user_metadata?.display_name || ''

  // Data state
  const [loading, setLoading]     = useState(true)
  const [poll, setPoll]           = useState(null)
  const [options, setOptions]     = useState([])
  const [myVote, setMyVote]       = useState(null)
  const [round, setRound]         = useState(1)
  const [error, setError]         = useState(null)
  const [notification, setNotification] = useState(null)
  const [modalBook, setModalBook] = useState(null)

  // Filters + sorting state
  const [genreFilter,   setGenreFilter]   = useState([])
  const [countryFilter, setCountryFilter] = useState([])
  const [genderFilter,  setGenderFilter]  = useState([])
  const [sortField,     setSortField]     = useState('title')
  const [sortAsc,       setSortAsc]       = useState(true)

  const [allGenres,    setAllGenres]    = useState([])
  const [allCountries, setAllCountries] = useState([])
  const [allGenders,   setAllGenders]   = useState([])

  const clearAll = () => {
    setGenreFilter([])
    setCountryFilter([])
    setGenderFilter([])
  }

  // 1) Load open poll (now grabbing `tally`)
  useEffect(() => {
    async function fetchPoll() {
      setLoading(true)
      const { data: p, error: pe } = await supabase
        .from('polls')
        .select('id,round,tally,past_meeting_id')
        .eq('status', 'open')
        .maybeSingle()
      if (pe && pe.code !== 'PGRST116') {
        setError('Hiba töltéskor: ' + pe.message)
      } else if (!p) {
        setError('Nincs éppen nyitott szavazás.')
      } else {
        setPoll(p)
        setRound(p.round)
      }
      setLoading(false)
    }
    fetchPoll()
  }, [])

  // 2) Load options + existing vote (no more poll_options table)
  useEffect(() => {
    if (!poll) return
    async function loadOptions() {
      setLoading(true)
      setError(null)
      try {
        let bookIds, bs

        if (round === 1) {
          // first round: entire waitlist
          const { data: all, error } = await supabase
            .from('books')
            .select(`
              id, title, cover_url, author, page_count,
              genre, country, author_gender, is_selected, added_by, release_year
            `)
          if (error) throw error

          // filter out already-selected and your own adds
          bs = all.filter(
            b => !b.is_selected && b.added_by !== displayName
          )

        } else {
          // round > 1: look up the *previous* round’s tally
          const { data: prev, error: prevErr } = await supabase
            .from('polls')
            .select('tally')
            .eq('past_meeting_id', poll.past_meeting_id)
            .eq('round', round - 1)
            .single()
          if (prevErr) throw prevErr

          // count votes per book
          const mapping = prev?.tally || {}
          const counts = Object.values(mapping).reduce((acc, bid) => {
            acc[bid] = (acc[bid] || 0) + 1
            return acc
          }, {})
          const sorted = Object.entries(counts).sort(([,a],[,b]) => b - a)

          let filterIds = []
          if (sorted.length) {
            const topCount = sorted[0][1]
            // all books tied for top
            filterIds = sorted.filter(([,c]) => c === topCount).map(([id]) => id)
            if (filterIds.length === 1) {
              // only one top → include second‐place as well
              const secondCount = sorted[1]?.[1] || 0
              const secondIds = sorted.filter(([,c]) => c === secondCount).map(([id]) => id)
              filterIds = [filterIds[0], ...secondIds]
            }
          }

          // fetch only those books
          if (filterIds.length) {
            const { data, error } = await supabase
              .from('books')
              .select('id, title, cover_url, author, page_count, genre, country, author_gender, release_year')
              .in('id', filterIds)
            if (error) throw error
            bs = data
          } else {
            bs = []
          }
        }

        // build opts array
        const opts = bs.map(b => ({
          book_id: b.id,
          book: { ...b, genres: b.genre }
        }))

        setOptions(opts)
        setAllGenres(
          Array.from(new Set(opts.flatMap(o => o.book.genres))).sort()
        )
        setAllCountries(
          Array.from(new Set(opts.map(o => o.book.country).filter(Boolean))).sort()
        )
        setAllGenders(
          Array.from(new Set(opts.map(o => o.book.author_gender).filter(Boolean))).sort()
        )

        // load this user's vote
        const { data: v, error: ve } = await supabase
          .from('votes')
          .select('book_id')
          .eq('poll_id', poll.id)
          .eq('user_id', user.id)
          .eq('round', round)
          .maybeSingle()
        if (!ve && v) setMyVote(v.book_id)

      } catch (err) {
        console.error(err)
        setError(err.message || 'Hiba a könyvek betöltésekor')
      } finally {
        setLoading(false)
      }
    }
    loadOptions()
  }, [poll, round, displayName, user.id])

  // Build headless collections
  const genreCollection   = useMemo(() =>
    createListCollection({ items: allGenres.map(g => ({ label: g, value: g })) }),
    [allGenres]
  )
  const countryCollection = useMemo(() =>
    createListCollection({ items: allCountries.map(c => ({ label: c, value: c })) }),
    [allCountries]
  )
  const genderCollection  = useMemo(() =>
    createListCollection({ items: allGenders.map(g => ({ label: g, value: g })) }),
    [allGenders]
  )
  const sortCollection    = useMemo(() =>
    createListCollection({
      items: [
        { label: 'ABC', value: 'title' },
        { label: 'Megjelenés', value: 'release_year' },
        { label: 'Oldalszám', value: 'page_count' },
      ],
    }),
    []
  )

  // Filter & sort logic
  const displayedOptions = useMemo(() => {
    let list = [...options]
    if (genreFilter.length)
      list = list.filter(o => o.book.genres.some(g => genreFilter.includes(g)))
    if (countryFilter.length)
      list = list.filter(o => countryFilter.includes(o.book.country))
    if (genderFilter.length)
      list = list.filter(o => genderFilter.includes(o.book.author_gender))

    list.sort((a, b) => {
      let va = a.book[sortField]
      let vb = b.book[sortField]
      if (sortField === 'title') {
        va = va.toLowerCase()
        vb = vb.toLowerCase()
      }
      if (va < vb) return sortAsc ? -1 : 1
      if (va > vb) return sortAsc ? 1 : -1
      return 0
    })
    return list
  }, [options, genreFilter, countryFilter, genderFilter, sortField, sortAsc])

  // Cast vote
  const castVote = async bookId => {
    if (!poll) return
    setLoading(true)
    const { error: ve } = await supabase
      .from('votes')
      .insert([{ poll_id: poll.id, user_id: user.id, book_id: bookId, round }])
    setLoading(false)
    if (ve) {
      setNotification({ status: 'error', title: 'Hiba', description: ve.message })
    } else {
      setMyVote(bookId)
      setNotification({ status: 'success', title: 'Szavazat sikeres!' })
      onVoted?.(poll.id, round, bookId)
    }
  }

  // Auto-dismiss notifications
  useEffect(() => {
    if (!notification) return
    const t = setTimeout(() => setNotification(null), 3000)
    return () => clearTimeout(t)
  }, [notification])

  // Round stop
  useEffect(() => {
    if (!myVote || !poll) return;

    (async () => {
      // 1) all votes for this poll & round
      const { data: votes } = await supabase
        .from('votes')
        .select('user_id,book_id')
        .eq('poll_id', poll.id)
        .eq('round', round)

      // 2) fetch the single most‐recent meeting
      const { data: lastMeet } = await supabase
        .from('meetings')
        .select('attendees')
        .order('date', { ascending: false })
        .order('time', { ascending: false })
        .limit(1)
        .single()

      const eligible = Array.isArray(lastMeet?.attendees)
        ? lastMeet.attendees
        : []

      // 3) have all eligible users voted?
      const uniqueVoters = [...new Set(votes.map(v => v.user_id))]
      if (uniqueVoters.length !== eligible.length) return

      // 4) build tally: user_id → book_id
      const tally = votes.reduce((acc, { user_id, book_id }) => {
        acc[user_id] = book_id
        return acc
      }, {})

      // 5) write into polls.tally
      await supabase
        .from('polls')
        .update({ tally })
        .eq('id', poll.id)

      // 6) notify
      setNotification({
        status: 'info',
        title: 'Hamarosan eredményhirdetés',
      })
    })()
  }, [myVote, poll, round])

  if (loading) return <VStack py={10}><Spinner size="lg"/></VStack>
  if (error) {
    return (
      <Alert.Root status="error">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Hiba</Alert.Title>
          <Alert.Description>{error}</Alert.Description>
        </Alert.Content>
      </Alert.Root>
    )
  }


  return (
    <VStack spacing={6} align="stretch" p={4}>
      {notification && (
        <Alert.Root status={notification.status}>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{notification.title}</Alert.Title>
            {notification.description && (
              <Alert.Description>{notification.description}</Alert.Description>
            )}
          </Alert.Content>
        </Alert.Root>
      )}

      {/* Header */}
      <HStack justify="space-between">
        <Heading size="md">Szavazás – {round}. forduló</Heading>
        <IconButton
            aria-label="Bezár"
            variant="ghost"
            colorScheme="gray"
            onClick={onClose}
        >
            {<FaTimes />}
        </IconButton>
      </HStack>

      <Flex w="100%" mb={2} align="center" justify="center">
        {myVote ? (
          <Text fontSize="md" color="red.600" fontStyle="italic">
            Ebben a körben már szavaztál.
          </Text>
        ) : (
          <Text fontSize="sm">
            Válassz egy könyvet a listából, majd kattints a „Szavazok” gombra.
          </Text>
        )}
      </Flex>

      {/* Desktop filters */}
      <Box display={{ base: 'none', md: 'flex' }} justifyContent="space-between"  alignItems="center">
        <HStack spacing={3}>
          {/* Genre */}
          <Select.Root multiple collection={genreCollection} value={genreFilter} onValueChange={e => setGenreFilter(e.value)}>
            <Select.HiddenSelect aria-label="Műfaj" />
            <Select.Label>Műfaj</Select.Label>
            <Select.Control>
              <Select.Trigger><Select.ValueText placeholder="Műfaj" /></Select.Trigger>
            </Select.Control>
            <Select.IndicatorGroup>
              <Select.Indicator/>
              <Select.ClearTrigger onClick={clearAll}/>
            </Select.IndicatorGroup>
            <Portal>
                <Select.Positioner>
                    <Select.Content asChild>
                    <Box
                        maxH="200px"
                        overflowY="auto"
                        minW="250px"
                        p={2}
                        bg="white"
                        shadow="md"
                        borderRadius="md"
                    >
                        {genreCollection.items.map(item => (
                        <Select.Item key={item.value} item={item}>
                            {item.label}
                            <Select.ItemIndicator><FaCheck/></Select.ItemIndicator>
                        </Select.Item>
                        ))}
                    </Box>
                    </Select.Content>
                </Select.Positioner>
                </Portal>
            </Select.Root>

          {/* Country */}
          <Select.Root multiple collection={countryCollection} value={countryFilter} onValueChange={e => setCountryFilter(e.value)}>
            <Select.HiddenSelect aria-label="Ország" />
            <Select.Label>Ország</Select.Label>
            <Select.Control>
              <Select.Trigger><Select.ValueText placeholder="Ország" /></Select.Trigger>
            </Select.Control>
            <Select.IndicatorGroup>
              <Select.Indicator/>
              <Select.ClearTrigger onClick={clearAll}/>
            </Select.IndicatorGroup>
            <Portal>
              <Select.Positioner>
                <Select.Content asChild>
                    <Box
                        maxH="200px"
                        overflowY="auto"
                        minW="250px"
                        p={2}
                        bg="white"
                        shadow="md"
                        borderRadius="md"
                    >
                    {countryCollection.items.map(item => (
                        <Select.Item key={item.value} item={item}>
                        {item.label}
                        <Select.ItemIndicator><FaCheck/></Select.ItemIndicator>
                        </Select.Item>
                    ))}
                    </Box>
                </Select.Content>
              </Select.Positioner>
            </Portal>
          </Select.Root>

          {/* Gender */}
          <Select.Root multiple collection={genderCollection} value={genderFilter} onValueChange={e => setGenderFilter(e.value)}>
            <Select.HiddenSelect aria-label="Szerző neme" />
            <Select.Label whiteSpace="nowrap">Szerző neme</Select.Label>
            <Select.Control>
              <Select.Trigger><Select.ValueText placeholder="Szerző neme" /></Select.Trigger>
            </Select.Control>
            <Select.IndicatorGroup>
              <Select.Indicator/>
              <Select.ClearTrigger onClick={clearAll}/>
            </Select.IndicatorGroup>
            <Portal>
              <Select.Positioner>
                <Select.Content asChild>
                    <Box
                        maxH="200px"
                        overflowY="auto"
                        minW="250px"
                        p={2}
                        bg="white"
                        shadow="md"
                        borderRadius="md"
                    >
                        {genderCollection.items.map(item => (
                            <Select.Item key={item.value} item={item}>
                            {item.label}
                            <Select.ItemIndicator><FaCheck/></Select.ItemIndicator>
                            </Select.Item>
                        ))}
                    </Box>
                </Select.Content>
              </Select.Positioner>
            </Portal>
          </Select.Root>

          <IconButton
            aria-label="Szűrők törlése"
            onClick={clearAll}
            flexShrink={0}
            mt={6}
            disabled={
              genreFilter.length === 0 &&
              countryFilter.length === 0 &&
              genderFilter.length === 0
            }
            >
                <Box position="relative" w="1.5em" h="1.5em">
                    <Box as={FaFilter} boxSize="1.5em" position="absolute" right="0.01em" />
                    <Box
                        as={FaTimes}
                        position="absolute"
                        top="2"
                        right="-1"
                        fontSize="0.6em"
                        color="red.500"
                    />
                </Box>
            </IconButton>
        </HStack>

        <HStack spacing={2}>
            <IconButton
                aria-label={sortAsc ? 'Növekvő' : 'Csökkenő'}
                onClick={() => setSortAsc(v => !v)}
                flexShrink={0}
                mt={6}
            >
                {sortAsc ? <FaSortAmountUp /> : <FaSortAmountDown />}
            </IconButton>
          <Select.Root 
            collection={sortCollection} 
            value={[sortField]} 
            onValueChange={e => {
              const [first = 'title'] = e.value 
              setSortField(first)
            }}>
            <Select.HiddenSelect aria-label="Rendezés"/>
            <Select.Label textAlign={"right"}>Rendezés</Select.Label>
            <Select.Control>
              <Select.Trigger><Select.ValueText placeholder="Rendezés" /></Select.Trigger>
            </Select.Control>
            <Select.IndicatorGroup>
              <Select.Indicator/>
              <Select.ClearTrigger onClick={() => setSortField('title')}/>
            </Select.IndicatorGroup>
            <Portal>
              <Select.Positioner>
                <Select.Content asChild>
                    <Box
                        maxH="150px"
                        overflowY="auto"
                        minW="150px"
                        p={2}
                        bg="white"
                        shadow="md"
                        borderRadius="md"
                        position="absolute"
                        right="0"
                    >
                        {sortCollection.items.map(item => (
                            <Select.Item key={item.value} item={item}>
                            {item.label}
                            <Select.ItemIndicator><FaCheck/></Select.ItemIndicator>
                            </Select.Item>
                        ))}
                    </Box>
                </Select.Content>
              </Select.Positioner>
            </Portal>
          </Select.Root>
        </HStack>
      </Box>

      {/* Mobile icons */}
      <Box display={{ base: 'flex', md: 'none' }}>
        <HStack w="100%" alignItems="center">
          {/* Genre */}
          <Popover.Root>
            <Popover.Trigger asChild>
                <IconButton
                    aria-label="Műfaj"
                    variant={genreFilter.length ? 'solid' : 'outline'}
                >
                    <FaFilter/>
                </IconButton>
                </Popover.Trigger>
            <Popover.Positioner>
              <Popover.Content
                maxH="300px"
                overflowY="auto"
                w="80vw"
                p={3}
                bg="white"
                shadow="md"
                borderRadius="md"
            >
                <Popover.CloseTrigger asChild>
                    <IconButton aria-label="Bezár" size="sm">
                        <FaTimes/>
                    </IconButton>
                    </Popover.CloseTrigger>
                <Popover.Arrow><Popover.ArrowTip/></Popover.Arrow>
                <Popover.Body>
                    <Fieldset.Root>
                        <CheckboxGroup
                        value={genreFilter}
                        onValueChange={setGenreFilter}
                        name="genre"
                        >
                        <Fieldset.Legend fontSize="sm" mb="2">
                            Műfaj
                        </Fieldset.Legend>
                        <Fieldset.Content>
                            {allGenres.map(g => (
                            <Checkbox.Root key={g} value={g}>
                                <Checkbox.HiddenInput />
                                <Checkbox.Control />
                                <Checkbox.Label>{g}</Checkbox.Label>
                            </Checkbox.Root>
                            ))}
                        </Fieldset.Content>
                        </CheckboxGroup>
                    </Fieldset.Root>
                    </Popover.Body>
              </Popover.Content>
            </Popover.Positioner>
          </Popover.Root>

          {/* Country */}
          <Popover.Root>
            <Popover.Trigger asChild>
                <IconButton aria-label="Ország" variant={countryFilter.length ? 'solid' : 'outline'}>
                    <FaGlobe/>
                </IconButton>
                </Popover.Trigger>
            <Popover.Positioner>
              <Popover.Content
                maxH="300px"
                overflowY="auto"
                w="80vw"
                p={3}
                bg="white"
                shadow="md"
                borderRadius="md"
            >
                <Popover.CloseTrigger asChild>
                    <IconButton aria-label="Bezár" size="sm">
                        <FaTimes/>
                    </IconButton>
                    </Popover.CloseTrigger>
                <Popover.Arrow><Popover.ArrowTip/></Popover.Arrow>
                <Popover.Body>
                    <Fieldset.Root>
                        <CheckboxGroup
                        value={countryFilter}
                        onValueChange={setCountryFilter}
                        name="country"
                        >
                        <Fieldset.Legend fontSize="sm" mb="2">
                            Ország
                        </Fieldset.Legend>
                        <Fieldset.Content>
                            {allCountries.map(c => (
                            <Checkbox.Root key={c} value={c}>
                                <Checkbox.HiddenInput />
                                <Checkbox.Control />
                                <Checkbox.Label>{c}</Checkbox.Label>
                            </Checkbox.Root>
                            ))}
                        </Fieldset.Content>
                        </CheckboxGroup>
                    </Fieldset.Root>
                    </Popover.Body>
              </Popover.Content>
            </Popover.Positioner>
          </Popover.Root>

          {/* Gender */}
          <Popover.Root>
            <Popover.Trigger asChild>
                <IconButton aria-label="Szerző neme" variant={genderFilter.length ? 'solid' : 'outline'}>
                    <FaVenusMars/>
                </IconButton>
                </Popover.Trigger>
            <Popover.Positioner>
              <Popover.Content
                maxH="300px"
                overflowY="auto"
                w="80vw"
                p={3}
                bg="white"
                shadow="md"
                borderRadius="md"
            >
                <Popover.CloseTrigger asChild>
                    <IconButton aria-label="Bezár" size="sm">
                        <FaTimes/>
                    </IconButton>
                    </Popover.CloseTrigger>
                <Popover.Arrow><Popover.ArrowTip/></Popover.Arrow>
                <Popover.Body>
                    <Fieldset.Root>
                        <CheckboxGroup
                        value={genderFilter}
                        onValueChange={setGenderFilter}
                        name="gender"
                        >
                        <Fieldset.Legend fontSize="sm" mb="2">
                            Szerző neme
                        </Fieldset.Legend>
                        <Fieldset.Content>
                            {allGenders.map(g => (
                            <Checkbox.Root key={g} value={g}>
                                <Checkbox.HiddenInput />
                                <Checkbox.Control />
                                <Checkbox.Label>{g}</Checkbox.Label>
                            </Checkbox.Root>
                            ))}
                        </Fieldset.Content>
                        </CheckboxGroup>
                    </Fieldset.Root>
                    </Popover.Body>
              </Popover.Content>
            </Popover.Positioner>
          </Popover.Root>

          {/* Clear All */}
          <IconButton aria-label="Szűrők törlése" onClick={clearAll} disabled={
            genreFilter.length === 0 &&
            countryFilter.length === 0 &&
            genderFilter.length === 0
          }>
                <Box position="relative" w="1.5em" h="1.5em">
                    <Box as={FaFilter} boxSize="1.5em" position="absolute" right="0.01em" />
                    <Box
                        as={FaTimes}
                        position="absolute"
                        top="2"
                        right="-1"
                        fontSize="0.6em"
                        color="red.500"
                    />
                </Box>
            </IconButton>
        </HStack>

        <HStack spacing={2}>
          {/* Asc/Desc */}
          <IconButton
            aria-label={sortAsc ? 'Növekvő' : 'Csökkenő'}
            onClick={() => setSortAsc(v => !v)}
          >
                {sortAsc ? <FaSortAmountUp /> : <FaSortAmountDown />}
          </IconButton>
          {/* Sort */}
          <Popover.Root>
            <Popover.Trigger asChild>
                <IconButton aria-label="Rendezés">
                    <FaSort/>
                </IconButton>
             </Popover.Trigger>
            <Popover.Positioner>
              <Popover.Content>
                <Popover.CloseTrigger asChild>
                <IconButton aria-label="Bezár" size="sm">
                    <FaTimes/>
                </IconButton>
                </Popover.CloseTrigger>
                <Popover.Arrow><Popover.ArrowTip/></Popover.Arrow>
                <Popover.Body>
                  <Popover.Title mb={2} fontWeight={"bold"}>Rendezés</Popover.Title>
                  <RadioGroup.Root
                    value={sortField}
                    onValueChange={details  => setSortField(details.value)}
                    >
                    <HStack gap="4">
                        {sortCollection.items.map(item => (
                        <RadioGroup.Item key={item.value} value={item.value}>
                            <RadioGroup.ItemHiddenInput />
                            <RadioGroup.ItemIndicator />
                            <RadioGroup.ItemText>{item.label}</RadioGroup.ItemText>
                        </RadioGroup.Item>
                        ))}
                    </HStack>
                    </RadioGroup.Root>
                </Popover.Body>
              </Popover.Content>
            </Popover.Positioner>
          </Popover.Root>
        </HStack>
      </Box>

      {/* Book grid */}
      <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={4}>
        {displayedOptions.map(({ book_id, book }) => (
          <HStack key={book_id} p={3} borderWidth="1px" borderRadius="md" align="center" spacing={3}>
            <Image
              src={book.cover_url}
              alt={book.title}
              boxSize="50px"
              objectFit="cover"
              borderRadius="md"
              cursor="pointer"
              onClick={() => setModalBook(book)}
            />
            <Box flex="1" cursor="pointer" onClick={() => setModalBook(book)}>
              <Heading size="sm" noOfLines={1}>{book.title}</Heading>
              <Text fontSize="xs" color="gray.600" noOfLines={1}>
                {book.author} • {book.page_count} oldal
              </Text>
            </Box>
            <Button
              size="sm"
              boxSize="40px"
              p={0}
              colorScheme={myVote === book_id ? 'green' : 'blue'}
              disabled={!!myVote}
              onClick={() => castVote(book_id)}
              aria-label={myVote === book_id ? 'Szavaztál' : 'Szavazok'}
            >
              <FaCheck/>
            </Button>
          </HStack>
        ))}
      </SimpleGrid>

      {modalBook && (
        <BookDetailModal
          book={modalBook}
          isOpen
          onClose={() => setModalBook(null)}
          showRecommendations
        />
      )}
    </VStack>
  )
}
